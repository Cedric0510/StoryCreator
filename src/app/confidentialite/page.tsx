import { legalConfig } from "@/lib/legal";

export default function ConfidentialitePage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 18px", lineHeight: 1.6 }}>
      <h1>Politique de Confidentialite</h1>
      <p>Derniere mise a jour: {legalConfig.updatedAt}</p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Entite: {legalConfig.publisherName}
        <br />
        Adresse: {legalConfig.publisherAddress}
        <br />
        Contact privacy/DPO: {legalConfig.privacyContactEmail}
      </p>

      <h2>2. Donnees traitees</h2>
      <p>
        Compte utilisateur (email, role, nom d&apos;affichage), donnees de projets, fichiers medias,
        journaux de collaboration, journaux techniques de securite.
      </p>

      <h2>3. Finalites et bases juridiques</h2>
      <ul>
        <li>Fourniture du service (execution du contrat, art. 6.1.b RGPD)</li>
        <li>Securite et prevention d&apos;abus (interet legitime, art. 6.1.f RGPD)</li>
        <li>Obligations legales (art. 6.1.c RGPD)</li>
        <li>Mesure d&apos;audience optionnelle, si activee (consentement, art. 6.1.a RGPD)</li>
      </ul>

      <h2>4. Durees de conservation</h2>
      <ul>
        <li>Compte: pendant la vie du compte</li>
        <li>Compte inactif: suppression/anonymisation apres 24 mois</li>
        <li>Projets et assets: jusqu&apos;a suppression du projet ou fermeture du compte</li>
        <li>Journaux de collaboration (conversations d&apos;actions cloud): 180 jours</li>
        <li>Traces techniques/securite: 12 mois</li>
        <li>Demandes support/RGPD: 12 mois apres cloture</li>
      </ul>

      <h2>5. Destinataires</h2>
      <p>
        Equipe interne habilitee et sous-traitants techniques (hebergement/app/backend/storage),
        dans la limite de leurs habilitations.
      </p>

      <h2>6. Vos droits</h2>
      <p>
        Vous pouvez exercer vos droits d&apos;acces, rectification, effacement, limitation,
        opposition, portabilite et retrait de consentement (si applicable) via:{" "}
        {legalConfig.privacyContactEmail}.
      </p>
      <p>
        Vous pouvez egalement deposer une plainte aupres de la CNIL:{" "}
        <a href="https://www.cnil.fr/fr/adresser-une-plainte" target="_blank" rel="noreferrer">
          https://www.cnil.fr/fr/adresser-une-plainte
        </a>
      </p>

      <h2>7. Cookies</h2>
      <p>
        Le service utilise des cookies strictement necessaires a l&apos;authentification et au
        fonctionnement. Les cookies non essentiels sont desactives par defaut sans consentement.
      </p>

      <h2>8. Mises a jour</h2>
      <p>
        Cette politique peut evoluer. La version applicable est celle publiee sur cette page avec
        sa date de mise a jour.
      </p>
    </main>
  );
}
