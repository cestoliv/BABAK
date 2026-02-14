/**
 * Get GPG key from system configuration or environment variable
 */
export const getGPGKey = (systemConfig?: {
    gpg_key?: string;
}): string | undefined => {
    return systemConfig?.gpg_key || process.env.GPG_KEY;
};

/**
 * Check if encryption is enabled (GPG key is configured)
 */
export const isEncryptionEnabled = (systemConfig?: {
    gpg_key?: string;
}): boolean => {
    return !!getGPGKey(systemConfig);
};
