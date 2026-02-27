export const legalConfig = {
  updatedAt: process.env.LEGAL_UPDATED_AT || "27/02/2026",
  publisherName: process.env.LEGAL_PUBLISHER_NAME || "CadaRium Studio",
  legalForm: process.env.LEGAL_LEGAL_FORM || "Structure independante",
  publisherAddress:
    process.env.LEGAL_PUBLISHER_ADDRESS ||
    "France (coordonnees completes sur demande legitime)",
  publisherContactEmail: process.env.LEGAL_CONTACT_EMAIL || "contact@cadarium.studio",
  publisherContactPhone: process.env.LEGAL_CONTACT_PHONE || "Non communique",
  publicationDirector: process.env.LEGAL_PUBLICATION_DIRECTOR || "CadaRium Studio",
  privacyContactEmail: process.env.LEGAL_PRIVACY_EMAIL || "privacy@cadarium.studio",
  legalContactEmail: process.env.LEGAL_LEGAL_EMAIL || "legal@cadarium.studio",
};
