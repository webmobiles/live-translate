import path from 'path';
import dotenv from 'dotenv';

const envDir = path.join(__dirname, '..');

dotenv.config({
  path: path.join(envDir, '.env'),
  override: process.env.NODE_ENV !== 'production',
});

// Host-side `npm run dev` overrides (e.g. localhost DB URLs vs. the Docker
// hostnames in .env). Gitignored, not read by docker-compose's env_file.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.join(envDir, '.env.local'),
    override: true,
  });
}
