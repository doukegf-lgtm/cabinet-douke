'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deriveSalaryLines,
  toCnssPayload,
  type EmployeeInput,
  type CnssPeriodAnswer,
  type SalaryPeriod,
} from '@/lib/fiscal/mapper/payroll-lines'

type SectionInput = {
  id: string
  section_code: string
  fiscal_year: number
  status: 'draft' | 'submitted' | 'needs_changes' | 'validated'
  version: number
  validation_note?: string | null
  payload?: {
    source_mode?: 'actual' | 'estimated' | 'mixed'
    source_note?: string | null
    data?: {
      headcount?: number
      rp_rate?: string | null
      lines?: Array<Record<string, unknown>>
    }
  }
}

type ApiResult = {
  period_start?: string
  period_end?: string
  dossier_status?: string
  data?: unknown
}

type EmployeeForm = {
  employeeId: string
  hire: string
  departure: string
  periods: Array<{
    from: string
    to: string
    gross: string
    bonuses: string
    benefits: string
    otherTaxable: string
    provenance: 'real' | 'estimated'
  }>
}

type PaymentForm = {
  from: string
  to: string
  payment: 'yes' | 'no' | 'partial' | 'unknown'
  paymentDate: string
  amountPaid: string
  paymentVerified: boolean
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100'

const statusLabel: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis à revue',
  needs_changes: 'Corrections demandées',
  validated: 'Validé',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function monthOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function newEmployee(year: number): EmployeeForm {
  return {
    employeeId: '',
    hire: `${year}-01`,
    departure: '',
    periods: [{
      from: `${year}-01`,
      to: `${year}-12`,
      gross: '',
      bonuses: '',
      benefits: '',
      otherTaxable: '',
      provenance: 'real',
    }],
  }
}

function newPayment(year: number): PaymentForm {
  return {
    from: `${year}-01`,
    to: `${year}-12`,
    payment: 'unknown',
    paymentDate: '',
    amountPaid: '',
    paymentVerified: false,
  }
}

export default function CnssPeriodsClient({ dossierId }: { dossierId: string }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [periodStart, setPeriodStart] = useState<string | null>(null)
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [dossierStatus, setDossierStatus] = useState('')
  const [input, setInput] = useState<SectionInput | null>(null)
  const [employees, setEmployees] = useState<EmployeeForm[]>([])
  const [payments, setPayments] = useState<PaymentForm[]>([])
  const [headcount, setHeadcount] = useState('1')
  const [rpRate, setRpRate] = useState('')
  const [sourceNote, setSourceNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [calcResult, setCalcResult] = useState<unknown>(null)
  const [calcBlockers, setCalcBlockers] = useState<unknown[]>([])

  const locked = ['validated', 'closed'].includes(dossierStatus)
  const editable = !locked && (!input || ['draft', 'needs_changes'].includes(input.status))
  const canReview = !locked && input?.status === 'submitted'

  const years = useMemo(() => {
    if (!periodStart || !periodEnd) return [year]
    const start = Number(periodStart.slice(0, 4))
    const end = Number(periodEnd.slice(0, 4))
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 100) return [year]
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [periodStart, periodEnd, year])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/fiscal/dossiers/${dossierId}/sections?history=0`,
        { cache: 'no-store' },
      )
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Chargement CNSS impossible.')
      }
      if (!isRecord(result) || !Array.isArray(result.data)) {
        throw new Error('Réponse serveur invalide.')
      }

      setDossierStatus(typeof result.dossier_status === 'string' ? result.dossier_status : '')
      const start = typeof result.period_start === 'string' ? result.period_start : null
      const end = typeof result.period_end === 'string' ? result.period_end : null
      setPeriodStart(start)
      setPeriodEnd(end)

      const startYear = start ? Number(start.slice(0, 4)) : NaN
      const endYear = end ? Number(end.slice(0, 4)) : NaN
      const effectiveYear = Number.isInteger(startYear) && Number.isInteger(endYear)
        ? Math.max(startYear, Math.min(year, endYear))
        : year

      if (effectiveYear !== year) {
        setYear(effectiveYear)
        return
      }

      const found = result.data.find((item: unknown) =>
        isRecord(item) &&
        item.section_code === 'cnss_periods' &&
        item.fiscal_year === year,
      ) as SectionInput | undefined

      setInput(found || null)

      if (found?.payload?.data) {
        const data = found.payload.data
        setHeadcount(String(data.headcount ?? '1'))
        setRpRate(data.rp_rate ?? '')
        setSourceNote(found.payload.source_note ?? '')

        const grouped = new Map<string, EmployeeForm>()
        for (const line of data.lines ?? []) {
          const id = String(line.employee_id ?? '')
          if (!id) continue
          const existing = grouped.get(id) ?? {
            employeeId: id,
            hire: `${year}-01`,
            departure: '',
            periods: [],
          }
          existing.periods.push({
            from: String(line.period ?? `${year}-01`),
            to: String(line.period ?? `${year}-01`),
            gross: String(line.gross ?? ''),
            bonuses: String(line.bonuses ?? ''),
            benefits: String(line.benefits ?? ''),
            otherTaxable: String(line.other_taxable ?? ''),
            provenance: line.provenance === 'estimated' ? 'estimated' : 'real',
          })
          grouped.set(id, existing)
        }
        setEmployees(Array.from(grouped.values()))

        const byMonth = new Map<string, PaymentForm>()
        for (const line of data.lines ?? []) {
          const month = String(line.period ?? '')
          if (!month) continue
          const payment = line.payment === 'yes' || line.payment === 'no' || line.payment === 'partial'
            ? line.payment : 'unknown'
          const signature = [
            payment,
            String(line.payment_date ?? ''),
            String(line.payment_verified ?? false),
          ].join('|')
          const key = `${signature}|${month}`
          byMonth.set(key, {
            from: month,
            to: month,
            payment,
            paymentDate: String(line.payment_date ?? ''),
            amountPaid: String(line.amount_paid ?? ''),
            paymentVerified: line.payment_verified === true,
          })
        }
        setPayments(Array.from(byMonth.values()))
      } else {
        setHeadcount('1')
        setRpRate('')
        setSourceNote('')
        setEmployees([])
        setPayments([newPayment(year)])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement CNSS.')
    } finally {
      setLoading(false)
    }
  }, [dossierId, year])

  useEffect(() => { void load() }, [load])

  function updateEmployee(index: number, patch: Partial<EmployeeForm>) {
    setEmployees(old => old.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function updateSalaryPeriod(employeeIndex: number, periodIndex: number, patch: Partial<EmployeeForm['periods'][number]>) {
    setEmployees(old => old.map((employee, i) => i !== employeeIndex ? employee : ({
      ...employee,
      periods: employee.periods.map((period, j) => j === periodIndex ? { ...period, ...patch } : period),
    })))
  }

  function updatePayment(index: number, patch: Partial<PaymentForm>) {
    setPayments(old => old.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function buildPayload() {
    if (!employees.length) throw new Error('Ajoutez au moins un salarié.')
    if (!payments.length) throw new Error('Ajoutez les périodes de paiement CNSS.')

    const normalized: EmployeeInput[] = employees.map((employee, index) => {
      if (!employee.employeeId.trim()) throw new Error(`Salarié ${index + 1} : code salarié obligatoire.`)
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(employee.hire)) throw new Error(`Salarié ${employee.employeeId} : mois d'embauche invalide.`)

      const yearStart = `${year}-01`
      const yearEnd = `${year}-12`
      const hire = employee.hire < yearStart ? yearStart : employee.hire
      const departure = employee.departure && employee.departure < yearEnd
        ? employee.departure
        : yearEnd

      const periods: SalaryPeriod[] = employee.periods.map((period, j) => {
        if (!period.gross.trim()) throw new Error(`${employee.employeeId}, période salariale ${j + 1} : salaire brut obligatoire.`)
        return {
          from: period.from,
          to: period.to || null,
          gross: period.gross,
          bonuses: period.bonuses || '0',
          benefits: period.benefits || '0',
          otherTaxable: period.otherTaxable || '0',
          provenance: period.provenance,
        }
      })

      return {
        employeeId: employee.employeeId.trim(),
        hire,
        departure,
        periods,
      }
    })

    const salaryLines = deriveSalaryLines(normalized, `${year}-12`)
      .filter(line => line.month.startsWith(`${year}-`))

    if (!salaryLines.length) throw new Error('Aucune ligne mensuelle de paie générée pour cet exercice.')

    const answers: CnssPeriodAnswer[] = payments.map((payment, index) => {
      if (payment.payment === 'unknown') {
        throw new Error(`Période CNSS ${index + 1} : indiquez si les cotisations ont été payées ou non.`)
      }
      if (payment.payment === 'partial' && !payment.amountPaid.trim()) {
        throw new Error(`Période CNSS ${index + 1} : le montant payé est obligatoire pour un paiement partiel.`)
      }
      return {
        from: payment.from,
        to: payment.to,
        payment: payment.payment,
        paymentDate: payment.paymentDate || null,
        amountPaid: payment.amountPaid || null,
        paymentVerified: payment.paymentVerified,
      }
    })

    const mapped = toCnssPayload(salaryLines, answers, {
      headcount: Number(headcount),
      rpRate: rpRate.trim() || null,
    })

    return {
      source_mode: mapped.source_mode,
      source_note: sourceNote.trim() || null,
      data: mapped.data,
      provenance: {
        capture: 'cabinet_cnss_interface',
        payment_verification: 'explicit_cabinet_confirmation',
      },
    }
  }

  async function save(submit: boolean) {
    if (locked) {
      setError('Le dossier est verrouillé.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = buildPayload()
      const response = await fetch(`/api/fiscal/dossiers/${dossierId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_code: 'cnss_periods',
          fiscal_year: year,
          submit,
          payload,
        }),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Enregistrement CNSS impossible.')
      }
      setNotice(submit ? 'Données CNSS soumises à la revue du cabinet.' : 'Brouillon CNSS enregistré.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde CNSS.')
    } finally {
      setSaving(false)
    }
  }

  async function transition(status: 'validated' | 'needs_changes') {
    if (!input) return
    if (status === 'needs_changes' && !reviewNote.trim()) {
      setError('Le motif du retour pour correction est obligatoire.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(
        `/api/fiscal/dossiers/${dossierId}/sections/${input.id}/cnss-transition`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, note: reviewNote.trim() || null }),
        },
      )
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Transition CNSS impossible.')
      }
      setNotice(status === 'validated' ? 'Section CNSS validée.' : 'Section CNSS retournée pour correction.')
      setReviewNote('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de validation CNSS.')
    } finally {
      setSaving(false)
    }
  }

  async function calculate() {
    setSaving(true)
    setError('')
    setNotice('')
    setCalcResult(null)
    setCalcBlockers([])
    try {
      const response = await fetch('/api/fiscal/calculations/cnss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossier_id: dossierId,
          fiscal_year: year,
          calc_date: new Date().toISOString().slice(0, 10),
          payment_recognition: 'verified_only',
        }),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        if (isRecord(result) && Array.isArray(result.blockers)) {
          setCalcBlockers(result.blockers)
        }
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Calcul CNSS bloqué.')
      }
      setCalcResult(result)
      setNotice('Calcul CNSS enregistré. Il reste soumis à revue et validation.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de calcul CNSS.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Régularisation sociale</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Cotisations et arriérés CNSS</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Registre des salariés, historique mensuel des rémunérations, paiements et vérification des justificatifs.
          </p>
        </div>
        <label className="text-sm font-semibold text-slate-700">
          Exercice
          <select
            value={year}
            disabled={saving || loading}
            onChange={e => setYear(Number(e.target.value))}
            className={inputClass}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
          {input ? `Version ${input.version}` : 'Nouvelle saisie'}
        </span>
        {input && <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-800">{statusLabel[input.status]}</span>}
        {locked && <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">Dossier verrouillé</span>}
      </div>

      {loading && <p className="mt-5 text-sm text-slate-500">Chargement des données CNSS…</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {!loading && (
        <>
          {input?.validation_note && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Observation du cabinet :</strong> {input.validation_note}
            </div>
          )}

          <fieldset disabled={!editable || saving} className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">
                Effectif concerné
                <input className={inputClass} type="number" min="1" max="10000" step="1"
                  value={headcount} onChange={e => setHeadcount(e.target.value)} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Effectif à utiliser pour la périodicité, à confirmer par le cabinet.</span>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Taux RP notifié (si applicable)
                <input className={inputClass} type="text" inputMode="decimal"
                  placeholder="Valeur notifiée ou laisser vide"
                  value={rpRate} onChange={e => setRpRate(e.target.value)} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Ne pas saisir un taux supposé.</span>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Note et références des pièces
                <input className={inputClass} maxLength={2000}
                  placeholder="Références des bordereaux, reçus, états de paie…"
                  value={sourceNote} onChange={e => setSourceNote(e.target.value)} />
              </label>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">1. Registre des salariés et rémunérations</h3>
                  <p className="mt-1 text-xs text-slate-500">Un salarié peut avoir plusieurs périodes de rémunération dans l’exercice.</p>
                </div>
                <button type="button" onClick={() => setEmployees(old => [...old, newEmployee(year)])}
                  className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
                  + Ajouter un salarié
                </button>
              </div>

              {employees.length === 0 && (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Aucun salarié saisi pour cet exercice.</p>
              )}

              <div className="mt-4 space-y-4">
                {employees.map((employee, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-slate-900">Salarié {index + 1}</h4>
                      <button type="button" onClick={() => setEmployees(old => old.filter((_, i) => i !== index))}
                        className="text-xs font-semibold text-red-700">Supprimer ce salarié</button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-semibold text-slate-600">Code salarié
                        <input className={inputClass} maxLength={100} value={employee.employeeId}
                          onChange={e => updateEmployee(index, { employeeId: e.target.value })} placeholder="Matricule ou identifiant interne" />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Mois d'embauche (AAAA-MM)
                        <input className={inputClass} value={employee.hire}
                          onChange={e => updateEmployee(index, { hire: e.target.value })} placeholder={`${year}-01`} />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Mois de départ (facultatif)
                        <input className={inputClass} value={employee.departure}
                          onChange={e => updateEmployee(index, { departure: e.target.value })} placeholder="AAAA-MM" />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-slate-800">Périodes de salaire</h5>
                      <button type="button" onClick={() => updateEmployee(index, {
                        periods: [...employee.periods, {
                          from: `${year}-01`, to: `${year}-12`, gross: '', bonuses: '',
                          benefits: '', otherTaxable: '', provenance: 'real',
                        }],
                      })} className="text-xs font-semibold text-blue-700">+ Ajouter une période de salaire</button>
                    </div>

                    {employee.periods.map((period, periodIndex) => (
                      <div key={periodIndex} className="mt-3 rounded-lg bg-slate-50 p-3">
                        <div className="flex justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">Période {periodIndex + 1}</span>
                          {employee.periods.length > 1 && (
                            <button type="button" onClick={() => updateEmployee(index, {
                              periods: employee.periods.filter((_, i) => i !== periodIndex),
                            })} className="text-xs text-red-700">Retirer</button>
                          )}
                        </div>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="text-xs font-semibold text-slate-600">Début (AAAA-MM)
                            <input className={inputClass} value={period.from}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { from: e.target.value })} />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Fin (AAAA-MM)
                            <input className={inputClass} value={period.to}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { to: e.target.value })} />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Salaire brut mensuel (XOF) *
                            <input className={inputClass} inputMode="decimal" value={period.gross}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { gross: e.target.value })} placeholder="Montant exact" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Primes mensuelles (XOF)
                            <input className={inputClass} inputMode="decimal" value={period.bonuses}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { bonuses: e.target.value })} placeholder="0 si aucune" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Avantages (XOF)
                            <input className={inputClass} inputMode="decimal" value={period.benefits}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { benefits: e.target.value })} placeholder="0 si aucun" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Autres éléments taxables (XOF)
                            <input className={inputClass} inputMode="decimal" value={period.otherTaxable}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { otherTaxable: e.target.value })} placeholder="0 si aucun" />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">Origine des données
                            <select className={inputClass} value={period.provenance}
                              onChange={e => updateSalaryPeriod(index, periodIndex, { provenance: e.target.value as 'real' | 'estimated' })}>
                              <option value="real">Réelle / justifiée</option>
                              <option value="estimated">Estimée</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">2. Paiements et cotisations CNSS</h3>
                  <p className="mt-1 text-xs text-slate-500">Déclarez les périodes couvertes par les paiements et leur état de vérification.</p>
                </div>
                <button type="button" onClick={() => setPayments(old => [...old, newPayment(year)])}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                  + Ajouter une période
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {payments.map((payment, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-800">Période de paiement {index + 1}</h4>
                      <button type="button" onClick={() => setPayments(old => old.filter((_, i) => i !== index))}
                        className="text-xs font-semibold text-red-700">Supprimer</button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="text-xs font-semibold text-slate-600">Du (AAAA-MM)
                        <input className={inputClass} value={payment.from}
                          onChange={e => updatePayment(index, { from: e.target.value })} />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Au (AAAA-MM)
                        <input className={inputClass} value={payment.to}
                          onChange={e => updatePayment(index, { to: e.target.value })} />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Situation du paiement
                        <select className={inputClass} value={payment.payment}
                          onChange={e => updatePayment(index, { payment: e.target.value as PaymentForm['payment'] })}>
                          <option value="unknown">À préciser</option>
                          <option value="yes">Payé</option>
                          <option value="no">Non payé</option>
                          <option value="partial">Partiellement payé</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Date du paiement (si connue)
                        <input className={inputClass} type="date" value={payment.paymentDate}
                          onChange={e => updatePayment(index, { paymentDate: e.target.value })} />
                      </label>
                      {payment.payment === 'partial' && (
                        <label className="text-xs font-semibold text-slate-600">Montant total payé pour cette période (XOF)
                          <input className={inputClass} inputMode="decimal" value={payment.amountPaid}
                            onChange={e => updatePayment(index, { amountPaid: e.target.value })} />
                        </label>
                      )}
                    </div>
                    {payment.payment !== 'no' && (
                      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={payment.paymentVerified}
                          onChange={e => updatePayment(index, { paymentVerified: e.target.checked })}
                          className="mt-1" />
                        <span>
                          <strong>Justificatif contrôlé par le cabinet</strong>
                          <span className="block text-xs text-slate-500">Cochez uniquement après contrôle du reçu, bordereau ou relevé correspondant. Cette confirmation autorise la prise en compte du paiement en mode vérifié.</span>
                        </span>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </fieldset>

          {editable && !loading && (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => void save(false)}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
                Enregistrer le brouillon
              </button>
              <button type="button" disabled={saving} onClick={() => void save(true)}
                className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                Soumettre à la revue du cabinet
              </button>
            </div>
          )}

          {canReview && (
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h3 className="font-semibold text-slate-900">3. Revue et validation CNSS</h3>
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Note de revue / motif de correction
                <textarea className={inputClass} rows={3} maxLength={2000}
                  value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                  placeholder="Vérifications effectuées ou corrections attendues…" />
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={saving || !reviewNote.trim()}
                  onClick={() => void transition('needs_changes')}
                  className="rounded-xl border border-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50">
                  Retourner pour correction
                </button>
                <button type="button" disabled={saving}
                  onClick={() => void transition('validated')}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  Valider la section CNSS
                </button>
              </div>
            </div>
          )}

          {input?.status === 'validated' && !locked && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Section CNSS validée.</p>
              <p className="mt-1 text-xs text-emerald-800">Le calcul peut maintenant être demandé. Il restera bloqué si le référentiel réglementaire est incomplet ou non validé.</p>
              <button type="button" disabled={saving} onClick={() => void calculate()}
                className="mt-3 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                Calculer les arriérés CNSS de {year}
              </button>
            </div>
          )}

          {calcBlockers.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-bold text-amber-950">Calcul bloqué : éléments à régulariser</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {calcBlockers.map((blocker, i) => (
                  <li key={i}>{isRecord(blocker)
                    ? `${String(blocker.code ?? 'BLOCAGE')} : ${String(blocker.message ?? 'Détail non fourni')}`
                    : String(blocker)}</li>
                ))}
              </ul>
            </div>
          )}

          {calcResult !== null && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-slate-950">Résultat retourné par le moteur CNSS</h3>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                {JSON.stringify(calcResult, null, 2)}
              </pre>
            </div>
          )}

          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            <strong>Contrôle documentaire :</strong> la case « justificatif contrôlé » est une attestation de revue du cabinet, pas un dépôt de fichier. Les pièces doivent être conservées dans le circuit documentaire du dossier. Les taux, plafonds, échéances et pénalités proviennent exclusivement du référentiel réglementaire validé.
          </p>
        </>
      )}
    </section>
  )
}
