import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://utwspojleufrbeylnazn.supabase.co';

// La clé publique anon (et non la clé service_role que vous avez insérée)
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d3Nwb2psZXVmcmJleWxuYXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjM2NjMsImV4cCI6MjA5NjU5OTY2M30.7J34vIO4K3DOOkcFGEXgUrvSxiCa1RvHz8u200QSScA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
