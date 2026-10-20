import { InfrastructureError } from "@/shared/errors/application-error";

export type HomeSectionResult<T> = { status: "LOADED"; value: T } | { status: "FAILED" };

/**
 * Loads one home section so an infrastructure failure stays inside that section. Every other error,
 * including Forbidden/Unauthenticated, propagates to the page's existing handling.
 */
export async function loadHomeSection<T>(load: () => Promise<T>): Promise<HomeSectionResult<T>> {
  try {
    return { status: "LOADED", value: await load() };
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) return { status: "FAILED" };
    throw error;
  }
}
