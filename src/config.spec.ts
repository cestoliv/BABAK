import {
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from 'bun:test';
import { parseConfig } from './config.ts';

describe('parseConfig', () => {
    let mockProcessExit: ReturnType<typeof spyOn>;
    let _mockConsoleDir: ReturnType<typeof spyOn>;

    beforeEach(() => {
        mockProcessExit = spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit called');
        }) as never);
        _mockConsoleDir = spyOn(console, 'dir').mockImplementation(() => {});
    });

    afterEach(() => {
        mock.restore();
    });

    const mockBunFile = (content: string) => {
        spyOn(Bun, 'file').mockReturnValue({
            text: () => Promise.resolve(content),
        } as ReturnType<typeof Bun.file>);
    };

    describe('valid configurations', () => {
        test('parses minimal SSH service', async () => {
            mockBunFile(`
services:
  - type: ssh
    name: my-server
    host:
      name: server1
      path: /data
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.services).toHaveLength(1);
            expect(config.services[0]?.type).toBe('ssh');
            expect(config.services[0]?.name).toBe('my-server');
        });

        test('parses minimal local service', async () => {
            mockBunFile(`
services:
  - type: local
    name: local-backup
    paths:
      - /home/user/docs
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.services[0]?.type).toBe('local');
        });

        test('parses wordpress_ftp service', async () => {
            mockBunFile(`
services:
  - type: wordpress_ftp
    name: wp-site
    host_url: https://example.com
    ftp:
      host: ftp.example.com
      user: ftpuser
      password: ftppass
      dir: /public_html
    database:
      host: localhost
      user: dbuser
      password: dbpass
      name: wordpress
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.services[0]?.type).toBe('wordpress_ftp');
        });

        test('applies default values for system config', async () => {
            mockBunFile(`
system: {}
services:
  - type: local
    name: test
    paths: [/tmp]
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.system).toBeDefined();
            expect(config.system?.backup_dir).toBe('./backups');
            expect(config.system?.temp_dir).toBe('/tmp/babak');
        });

        test('applies default enabled=true for services', async () => {
            mockBunFile(`
services:
  - type: local
    name: test
    paths: [/tmp]
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.services[0]?.enabled).toBe(true);
        });

        test('handles full system config with all options', async () => {
            mockBunFile(`
system:
  backup_dir: /custom/backups
  temp_dir: /custom/tmp
  gpg_key: "ABCDEF123456"
  ntfy:
    url: https://ntfy.sh
    topic: test-topic
    username: user
    password: pass
  retention:
    full_backup_lifetime: "12M"
    incremental_lifetime: "2M"
    keep_full_chains: 2
  duplicity:
    allow_source_mismatch: false
    full_if_older_than: "2M"
services:
  - type: local
    name: test
    paths: [/tmp]
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.system?.gpg_key).toBe('ABCDEF123456');
            expect(config.system?.ntfy?.url).toBe('https://ntfy.sh');
            expect(config.system?.retention?.keep_full_chains).toBe(2);
            expect(config.system?.duplicity?.allow_source_mismatch).toBe(false);
        });

        test('handles multiple services', async () => {
            mockBunFile(`
services:
  - type: local
    name: local1
    paths: [/tmp]
  - type: ssh
    name: ssh1
    host:
      name: server
      path: /data
`);
            const config = await parseConfig('/test/config.yml');
            expect(config.services).toHaveLength(2);
        });
    });

    describe('invalid configurations', () => {
        test('exits on missing services array', async () => {
            mockBunFile(`
system:
  backup_dir: /backups
`);
            await expect(parseConfig('/test/config.yml')).rejects.toThrow(
                'process.exit called',
            );
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        test('exits on invalid service type', async () => {
            mockBunFile(`
services:
  - type: invalid_type
    name: test
`);
            await expect(parseConfig('/test/config.yml')).rejects.toThrow(
                'process.exit called',
            );
        });

        test('exits when SSH service is missing host', async () => {
            mockBunFile(`
services:
  - type: ssh
    name: test
`);
            await expect(parseConfig('/test/config.yml')).rejects.toThrow(
                'process.exit called',
            );
        });

        test('exits when local service is missing paths', async () => {
            mockBunFile(`
services:
  - type: local
    name: test
`);
            await expect(parseConfig('/test/config.yml')).rejects.toThrow(
                'process.exit called',
            );
        });

        test('exits when ntfy url is not a valid URL', async () => {
            mockBunFile(`
system:
  ntfy:
    url: not-a-url
    topic: test
services:
  - type: local
    name: test
    paths: [/tmp]
`);
            await expect(parseConfig('/test/config.yml')).rejects.toThrow(
                'process.exit called',
            );
        });
    });

    describe('file path resolution', () => {
        test('uses provided configPath', async () => {
            const fileSpy = spyOn(Bun, 'file').mockReturnValue({
                text: () =>
                    Promise.resolve(
                        'services:\n  - type: local\n    name: test\n    paths: [/tmp]',
                    ),
            } as ReturnType<typeof Bun.file>);

            await parseConfig('/custom/path.yml');
            expect(fileSpy).toHaveBeenCalledWith('/custom/path.yml');
        });

        test('defaults to cwd/config.yml when no path provided', async () => {
            const fileSpy = spyOn(Bun, 'file').mockReturnValue({
                text: () =>
                    Promise.resolve(
                        'services:\n  - type: local\n    name: test\n    paths: [/tmp]',
                    ),
            } as ReturnType<typeof Bun.file>);

            await parseConfig();
            expect(fileSpy).toHaveBeenCalledWith(`${process.cwd()}/config.yml`);
        });
    });
});
