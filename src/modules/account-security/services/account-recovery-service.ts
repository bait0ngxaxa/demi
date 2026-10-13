import "server-only";

import type { AccountRecoveryDeliveryChannel, PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assertIndependentCredentialRecoverySupported } from "@/modules/auth/services/credential-recovery-state";

export const ACCOUNT_RECOVERY_TTL_MS = 15 * 60 * 1000;
export const ACCOUNT_RECOVERY_ISSUANCE_WINDOW_MS = 60 * 60 * 1000;
export const ACCOUNT_RECOVERY_MAX_ISSUANCES_PER_WINDOW = 5;

export type AccountRecoveryDatabase = PrismaClient;

export type AccountRecoveryDeliveryResult = {
  handoffUrl?: string;
};

export type AccountRecoveryDeliveryAdapter = {
  channel: AccountRecoveryDeliveryChannel;
  deliver(recoveryUrl: string): Promise<AccountRecoveryDeliveryResult>;
};

export type AccountRecoveryProvider = (input: {
  userId: string;
  authSubject: string;
  newPassword: string;
}) => Promise<void>;

export type AccountRecoveryDependencies = {
  database?: AccountRecoveryDatabase;
  findPerson?: (nationalId: string) => Promise<{ id: string } | null>;
  createToken?: () => string;
  now?: () => Date;
  delivery?: AccountRecoveryDeliveryAdapter;
  replacePasswordAndRevokeSessions?: AccountRecoveryProvider;
};

/** Historical assisted credentials remain unavailable until independent account-owner proof is approved. */
export async function issuePatientAccountRecovery(
  _actor: ActorContext | null | undefined,
  _relationshipId: unknown,
  _input: unknown,
  _dependencies?: AccountRecoveryDependencies,
): Promise<{ recoveryId: string; deliveryChannel: AccountRecoveryDeliveryChannel; expiresAt: Date; handoffUrl?: string }> {
  void [_actor, _relationshipId, _input, _dependencies];
  return assertIndependentCredentialRecoverySupported();
}

export async function getPatientAccountRecoveryAvailability(
  _token: unknown,
  _dependencies?: Pick<AccountRecoveryDependencies, "database" | "now">,
): Promise<{ expiresAt: Date }> {
  void [_token, _dependencies];
  return assertIndependentCredentialRecoverySupported();
}

export async function completePatientAccountRecovery(
  _input: unknown,
  _dependencies?: AccountRecoveryDependencies,
): Promise<void> {
  void [_input, _dependencies];
  return assertIndependentCredentialRecoverySupported();
}
