import { parse } from 'yaml';
import * as z from 'zod';
import { error } from './log';

// System configuration schema
const SystemConfigSchema = z.object({
    backup_dir: z.string().default('./backups'),
    temp_dir: z.string().default('/tmp/babak'),
    gpg_key: z.string().optional(),
    ntfy: z
        .object({
            url: z.string().url(),
            topic: z.string(),
            username: z.string().optional(),
            password: z.string().optional(),
        })
        .optional(),
    retention: z
        .object({
            full_backup_lifetime: z.string().default('6M'), // How long to keep full backups
            incremental_lifetime: z.string().default('1M'), // How long to keep incremental backups
            keep_full_chains: z.number().default(1), // How many full backup chains to keep
        })
        .optional(),
    duplicity: z
        .object({
            allow_source_mismatch: z.boolean().default(true),
            full_if_older_than: z.string().default('1M'),
        })
        .optional(),
    rclone: z
        .object({
            enabled: z.boolean().default(false),
            remote: z.string(), // Format: "remote-name:path/to/folder"
            sync_command: z.enum(['sync', 'copy', 'move']).default('sync'),
            flags: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            dry_run: z.boolean().default(false),
        })
        .optional(),
});

// SSH service schema
const SSHServiceSchema = z.object({
    type: z.literal('ssh'),
    name: z.string(),
    enabled: z.boolean().default(true),
    host: z.object({
        name: z.string(),
        path: z.string(),
    }),
    pre_command: z.string().optional(),
    post_command: z.string().optional(),
    storage: z.array(z.string()).min(1),
    exclude: z.array(z.string()).optional(),
});

// Local service schema
const LocalServiceSchema = z.object({
    type: z.literal('local'),
    name: z.string(),
    enabled: z.boolean().default(true),
    paths: z.array(z.string()),
    exclude: z.array(z.string()).optional(),
    pre_command: z.string().optional(),
    post_command: z.string().optional(),
});

// WordPress FTP service schema
const WordPressFTPServiceSchema = z.object({
    type: z.literal('wordpress_ftp'),
    name: z.string(),
    enabled: z.boolean().default(true),
    ftp: z.object({
        host: z.string(),
        user: z.string(),
        password: z.string(),
        dir: z.string(),
        secure: z.boolean().default(false),
    }),
    database: z.object({
        host: z.string(),
        user: z.string(),
        password: z.string(),
        name: z.string(),
    }),
    host_url: z.string().url(),
});

// Service discriminated union
const ServiceSchema = z.discriminatedUnion('type', [
    SSHServiceSchema,
    LocalServiceSchema,
    WordPressFTPServiceSchema,
]);

const ConfigSchema = z.object({
    system: SystemConfigSchema.optional(),
    services: z.array(ServiceSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type RcloneConfig = z.infer<typeof SystemConfigSchema>['rclone'];
export type SSHService = z.infer<typeof SSHServiceSchema>;
export type LocalService = z.infer<typeof LocalServiceSchema>;
export type WordPressFTPService = z.infer<typeof WordPressFTPServiceSchema>;
export type Service = z.infer<typeof ServiceSchema>;

export const filterServices = (
    services: Service[],
    serviceFilter: string[],
): Service[] => {
    if (serviceFilter.length === 0) {
        return services.filter((s) => s.enabled);
    }
    const knownNames = new Set(services.map((s) => s.name));
    const unknown = serviceFilter.filter((name) => !knownNames.has(name));
    if (unknown.length > 0) {
        error(`Unknown service(s): ${unknown.map((n) => `"${n}"`).join(', ')}`);
        error(
            `Available services: ${[...knownNames].map((n) => `"${n}"`).join(', ')}`,
        );
        process.exit(1);
    }
    return services.filter((s) => serviceFilter.includes(s.name));
};

export const parseConfig = async (configPath?: string): Promise<Config> => {
    const filePath = configPath ?? `${process.cwd()}/config.yml`;
    const file = await Bun.file(filePath).text();
    const configYaml = parse(file);
    const result = ConfigSchema.safeParse(configYaml);
    if (!result.success) {
        error(`Invalid config file (${filePath}):`);
        // biome-ignore lint/suspicious/noConsole: Logging validation errors using console.dir with depth
        console.dir(z.treeifyError(result.error), {
            depth: null,
            colors: true,
        });
        process.exit(1);
    }
    return result.data;
};
