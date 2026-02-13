import path from 'node:path';

import dotenv from 'dotenv';

const envDirectory = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(envDirectory, '.env.local') });
dotenv.config({ path: path.join(envDirectory, '.env') });
