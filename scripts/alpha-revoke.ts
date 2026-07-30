#!/usr/bin/env tsx

import { and, eq, isNull } from "drizzle-orm";

import {
  alphaInstallations,
  findAlphaInviteById,
  revokeAlphaInstallation,
  revokeAlphaInvite,
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
  inviteBecomesRedeemable: true;
};

export function requireRepairIntent(installationId: string | undefined, repair: boolean): void {
  if (installationId && !repair) {
    throw new Error(
      "Installation revocation is repair-only and reopens the original invite. Add --repair, or revoke the invite if its link may be exposed."
    );
  }
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
      inviteBecomesRedeemable: true
    };
  }

  return {
    target: "installation",
    installationId,
    found: true,
    alreadyRevoked: row.revokedAt !== null,
    inviteId: row.inviteId,
    repairOnly: true,
    inviteBecomesRedeemable: true
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

  const revoked = await withAlphaDb((db) =>
    inviteId ? revokeAlphaInvite(db, inviteId) : revokeAlphaInstallation(db, installationId as string)
  );
  if (!revoked) {
    throw new Error("No active matching alpha target was found.");
  }

  console.log(JSON.stringify({ mode: "apply", revoked: true, plan }, null, 2));
}

runCli(import.meta.url, main);
