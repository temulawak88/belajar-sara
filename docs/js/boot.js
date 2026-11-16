// Dimuat paling awal (script terpisah) agar error di modul lain tetap tertangkap.
import { installErrorHandlers } from './errors.js';

installErrorHandlers();
