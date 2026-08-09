-- Ficha 4 (checklist de aprobación) revertida a pedido del usuario.
ALTER TABLE "Proposal" DROP COLUMN "approvalCriteriaChecked";
ALTER TABLE "Proposal" DROP COLUMN "approvalCriteriaCheckedAt";
ALTER TABLE "SiteSettings" DROP COLUMN "approvalCriteria";
