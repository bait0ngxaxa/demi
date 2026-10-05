export const HOSPITAL_CONTENT_CREATE_RECOVERY_STORAGE_PREFIX = "demi.hospital-content.create.v1.";

export function hospitalContentCreateRecoveryStorageKey(recoveryScope: string): string {
  return `${HOSPITAL_CONTENT_CREATE_RECOVERY_STORAGE_PREFIX}${recoveryScope}`;
}

export function clearHospitalContentCreateRecoveryMarkers(
  storage: Pick<Storage, "length" | "key" | "removeItem">,
): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(HOSPITAL_CONTENT_CREATE_RECOVERY_STORAGE_PREFIX)) {
      storage.removeItem(key);
    }
  }
}
