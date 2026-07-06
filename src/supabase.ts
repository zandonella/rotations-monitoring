import { createClient } from '@supabase/supabase-js';
import { config } from './config.ts';

export const supabase = createClient(config.supabaseUrl, config.supabaseKey);
