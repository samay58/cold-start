#!/usr/bin/env tsx

import { and, eq, isNull } from "drizzle-orm";

import {
  alphaInstallations,
  findAlphaInviteById,
  revokeAlphaInstallation,
  revokeAlphaInvite,
  type AlphaInvite,
  type ColdStartDb
} from "@cold-start/db";

import {
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  runCli,
  valueFor,
  withAlphaDb
} from "./alpha-common";

const HELP = `Revoke an alpha invitation or one installation.

Usage:
  npm run alpha:revoke -- --invite <invite-id>                  # dry run, no writes
  npm run alpha:revoke -- --invite <invite-id> --apply           # revoke
  npm run alpha:revoke -- --installation <installation-id> --repair
  npm run alpha:revoke -- --installation <installation-id> --repair --apply

Exactly one target is required. Revoking an invitation also revokes all of its
active installations. Installation revocation is only for repairing a failed
setup: it frees the seat and makes the original invite redeemable again. Revoke
the invitation instead if its link may be exposed. Without --apply, prints the
plan and writes nothing.`;

type InvitePlan = {
  target: "invite";
  inviteId: string;
  found: boolean;
  alreadyRevoked: boolean;
  label: string | null;
  activeInstallations: number;
};

type InstallationPlan = {
  target: "installation";
  installationId: string;
  found: boolean;
  alreadyRevoked: boolean;
  inviteId: string | null;
  repairOnly: true;
  inviteBecomesRedeemable: boolean;
  repairBlockedReason: string | null;
};

export function requireRepairIntent(installationId: string | undefined, repair: boolean): void {
  if (installationId && !repair) {
    throw new Error(
      "Installation revocation is repair-only and reopens the original invite. Add --repair, or revoke the invite if its link may be exposed."
    );
  }
}

export function repairBlockedReason(
  invite: Pick<AlphaInvite, "status" | "expiresAt" | "maxInstallations"> | null,
  activeInstallationsAfterRepair: number,
  now = new Date()
): string | null {
  if (!invite) {
    return "the invitation no longer exists";
  }
  if (invite.status === "revoked") {
    return "the invitation is revoked";
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return "the invitation is expired";
  }
  if (activeInstallationsAfterRepair >= invite.maxInstallations) {
    return "the invitation will still be at its installation limit";
  }
  return null;
}

async function invitePlan(db: ColdStartDb, inviteId: string): Promise<InvitePlan> {
  const invite = await findAlphaInviteById(db, inviteId);
  if (!invite) {
    return { target: "invite", inviteId, found: false, alreadyRevoked: false, label: null, activeInstallations: 0 };
  }

  const active = await db
    .select({ id: alphaInstallations.id })
    .from(alphaInstallations)
    .where(and(eq(alphaInstallations.inviteId, inviteId), isNull(alphaInstallations.revokedAt)));

  return {
    target: "invite",
    inviteId,
    found: true,
    alreadyRevoked: invite.status === "revoked",
    label: invite.label,
    activeInstallations: active.length
  };
}

async function installationPlan(db: ColdStartDb, installationId: string): Promise<InstallationPlan> {
  const rows = await db
    .select({ inviteId: alphaInstallations.inviteId, revokedAt: alphaInstallations.revokedAt })
    .from(alphaInstallations)
    .where(eq(alphaInstallations.id, installationId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return {
      target: "installation",
      installationId,
      found: false,
      alreadyRevoked: false,
      inviteId: null,
      repairOnly: true,
      inviteBecomesRedeemable: false,
      repairBlockedReason: "the installation was not found"
    };
  }

  const [invite, active] = await Promise.all([
    findAlphaInviteById(db, row.inviteId),
    db
      .select({ id: alphaInstallations.id })
      .from(alphaInstallations)
      .where(and(eq(alphaInstallations.inviteId, row.inviteId), isNull(alphaInstallations.revokedAt)))
  ]);
  const activeAfterRepair = Math.max(0, active.length - (row.revokedAt === null ? 1 : 0));
  const blockedReason = repairBlockedReason(invite, activeAfterRepair);

  return {
    target: "installation",
    installationId,
    found: true,
    alreadyRevoked: row.revokedAt !== null,
    inviteId: row.inviteId,
    repairOnly: true,
    inviteBecomesRedeemable: blockedReason === null,
    repairBlockedReason: blockedReason
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const inviteId = valueFor(args, "--invite")?.trim();
  const installationId = valueFor(args, "--installation")?.trim();
  if (Boolean(inviteId) === Boolean(installationId)) {
    throw new Error("Provide exactly one of --invite or --installation.");
  }
  requireRepairIntent(installationId, hasFlag(args, "--repair"));

  loadProductionEnv();
  const apply = hasFlag(args, "--apply");

  const plan = await withAlphaDb((db) =>
    inviteId ? invitePlan(db, inviteId) : installationPlan(db, installationId as string)
  );
  const wouldRevoke = plan.found && !plan.alreadyRevoked;

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", wouldRevoke, plan }, null, 2));
    return;
  }

  if (!wouldRevoke) {
    throw new Error("No active matching alpha target was found.");
  }
  if (plan.target === "installation" && !plan.inviteBecomesRedeemable) {
    throw new Error(`Installation repair cannot reopen the invite because ${plan.repairBlockedReason}.`);
  }

  const revoked = await withAlphaDb((db) =>
    inviteId ? revokeAlphaInvite(db, inviteId) : revokeAlphaInstallation(db, installationId as string)
  );
  if (!revoked) {
    throw new Error("No active matching alpha target was found.");
  }

  let appliedPlan: InvitePlan | InstallationPlan = plan;
  if (installationId) {
    try {
      appliedPlan = await withAlphaDb((db) => installationPlan(db, installationId));
    } catch {
      console.error(JSON.stringify({
        mode: "apply",
        revoked: true,
        verification: "failed",
        target: "installation",
        installationId,
        next: "Run alpha:status before retrying. The installation was already revoked."
      }, null, 2));
      throw new Error("The installation was revoked, but the repair readback failed.");
    }
  }
  if (appliedPlan.target === "installation" && !appliedPlan.inviteBecomesRedeemable) {
    throw new Error(
      `The installation was revoked, but the invite did not reopen because ${appliedPlan.repairBlockedReason}.`
    );
  }

  console.log(JSON.stringify({ mode: "apply", revoked: true, plan: appliedPlan }, null, 2));
}

runCli(import.meta.url, main);
