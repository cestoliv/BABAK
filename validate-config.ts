import { parseConfig } from './src/config.ts';
import { info } from './src/log.ts';

const filePath = Bun.argv[2];
const config = await parseConfig(filePath);

info('Config validated successfully');
for (const s of config.services) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(' -', s.name, '| enabled:', s.enabled);
}
