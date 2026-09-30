import { runAutopilot } from './autopilot.ts'
import { DAY_MS } from './clock.ts'
import { logActivity } from './receivables.ts'
import type { Debtor, Invoice, PayerProfile } from './types.ts'

interface SeedLine {
  id: string
  number: string
  debtor: Debtor
  mission: string
  amountEur: number
  /** Days between the due date and this morning. */
  dueDaysAgo: number
  profile: PayerProfile
}

/**
 * Fictional overdue invoices of the client agency. Each one starts bare on its
 * due date and the demo autopilot replays its history up to this morning, so
 * the journal, the emails, the calls and the column all agree. Phone numbers
 * and addresses are placeholders.
 */
const LINES: SeedLine[] = [
  { id: 'f-0961', number: 'F-2026-0961', profile: 'fiable', dueDaysAgo: 0, amountEur: 4_380, mission: '2 caristes, semaine 38', debtor: { company: 'Imprimerie Croix-Rousse', contactName: 'Julie Perrin', contactRole: 'Comptable', phone: '+33472000111', email: 'compta@imprimerie-croixrousse.example' } },
  { id: 'f-0962', number: 'F-2026-0962', profile: 'lent', dueDaysAgo: 0, amountEur: 9_640, mission: '4 préparateurs de commandes, semaines 37 à 38', debtor: { company: 'Drive Frais Rhône', contactName: 'Yanis Belkacem', contactRole: 'Responsable administratif', phone: '+33472000112', email: 'admin@drivefrais.example' } },
  { id: 'f-0958', number: 'F-2026-0958', profile: 'fiable', dueDaysAgo: 2, amountEur: 5_912.4, mission: '5 opérateurs de production, semaines 36 à 37', debtor: { company: 'Plasturgie de l’Ain', contactName: 'Céline Roche', contactRole: 'Comptable', phone: '+33474000105', email: 'c.roche@plasturgie-ain.example' } },
  { id: 'f-0957', number: 'F-2026-0957', profile: 'mauvais', dueDaysAgo: 2, amountEur: 12_300, mission: '3 chaudronniers, semaines 35 à 37', debtor: { company: 'Chaudronnerie de Vaulx', contactName: 'Bruno Lefèvre', contactRole: 'Gérant', phone: '+33472000113', email: 'b.lefevre@chaudronnerie-vaulx.example' } },
  { id: 'f-0951', number: 'F-2026-0951', profile: 'renvoi', dueDaysAgo: 4, amountEur: 3_184, mission: '1 peintre carrossier, août', debtor: { company: 'Carrosserie Vénissieux', contactName: 'Sandrine Lopes', contactRole: 'Assistante de direction', phone: '+33472000103', email: 's.lopes@carrosserie-venissieux.example' } },
  { id: 'f-0949', number: 'F-2026-0949', profile: 'lent', dueDaysAgo: 5, amountEur: 11_075, mission: '8 préparateurs de commandes, août', debtor: { company: 'Pain du Lyonnais', contactName: 'Marc Tissot', contactRole: 'Directeur administratif', phone: '+33478000106', email: 'm.tissot@paindulyonnais.example' } },
  { id: 'f-0950', number: 'F-2026-0950', profile: 'absent', dueDaysAgo: 4, amountEur: 7_820, mission: '3 manutentionnaires, semaines 35 à 36', debtor: { company: 'Frigo Transports Isère', contactName: 'Laurent Gay', contactRole: 'Gérant', phone: '+33476000114', email: 'contact@frigo-transports.example' } },
  { id: 'f-0952', number: 'F-2026-0952', profile: 'fiable', dueDaysAgo: 4, amountEur: 6_450, mission: '6 conditionneurs, semaines 35 à 36', debtor: { company: 'Embal’ Sud-Est', contactName: 'Inès Haddad', contactRole: 'Responsable administrative', phone: '+33475000110', email: 'i.haddad@embal-sudest.example' } },
  { id: 'f-0936', number: 'F-2026-0936', profile: 'mauvais', dueDaysAgo: 9, amountEur: 6_900, mission: '2 soudeurs, semaines 34 à 36', debtor: { company: 'Atelier Morel', contactName: 'Didier Morel', contactRole: 'Gérant', phone: '+33474000109', email: 'd.morel@atelier-morel.example' } },
  { id: 'f-0912', number: 'F-2026-0912', profile: 'lent', dueDaysAgo: 12, amountEur: 18_420, mission: '6 coffreurs, chantier Gerland, semaines 33 à 35', debtor: { company: 'Bâti Rhône SAS', contactName: 'Nadia Ferrand', contactRole: 'Comptabilité fournisseurs', phone: '+33472000101', email: 'compta@bati-rhone.example' } },
  { id: 'f-0944', number: 'F-2026-0944', profile: 'litige', dueDaysAgo: 5, amountEur: 7_260.5, mission: '3 caristes, semaines 35 à 37', debtor: { company: 'Logistique Part-Dieu', contactName: 'Hervé Collin', contactRole: 'Responsable d’exploitation', phone: '+33472000102', email: 'h.collin@logistique-partdieu.example' } },
  { id: 'f-0899', number: 'F-2026-0899', profile: 'mauvais', dueDaysAgo: 16, amountEur: 26_730, mission: '4 chauffeurs PL, juillet', debtor: { company: 'Transports Dauphiné', contactName: 'Olivier Brun', contactRole: 'Gérant', phone: '+33476000104', email: 'o.brun@transports-dauphine.example' } },
  { id: 'f-0931', number: 'F-2026-0931', profile: 'fiable', dueDaysAgo: 8, amountEur: 2_450, mission: '2 menuisiers poseurs, semaine 34', debtor: { company: 'Menuiserie Girard', contactName: 'Paul Girard', contactRole: 'Gérant', phone: '+33474000107', email: 'p.girard@menuiserie-girard.example' } },
  // Not yet due: they fall due during a replay and keep the first columns busy.
  { id: 'f-0966', number: 'F-2026-0966', profile: 'fiable', dueDaysAgo: -1, amountEur: 8_150, mission: '3 magasiniers, semaine 38', debtor: { company: 'Rhône Emballages', contactName: 'Sophie Arnaud', contactRole: 'Comptable fournisseurs', phone: '+33472000115', email: 's.arnaud@rhone-emballages.example' } },
  { id: 'f-0967', number: 'F-2026-0967', profile: 'litige', dueDaysAgo: -2, amountEur: 5_430, mission: '2 électriciens, chantier Confluence', debtor: { company: 'Élec Confluence', contactName: 'Thierry Blanc', contactRole: 'Conducteur de travaux', phone: '+33472000116', email: 't.blanc@elec-confluence.example' } },
  { id: 'f-0968', number: 'F-2026-0968', profile: 'lent', dueDaysAgo: -3, amountEur: 15_980, mission: '7 opérateurs de ligne, semaines 37 à 38', debtor: { company: 'Agroalimentaire du Beaujolais', contactName: 'Camille Dufour', contactRole: 'Directrice financière', phone: '+33474000117', email: 'c.dufour@agro-beaujolais.example' } },
  { id: 'f-0969', number: 'F-2026-0969', profile: 'renvoi', dueDaysAgo: -5, amountEur: 3_760, mission: '1 secrétaire médicale, septembre', debtor: { company: 'Clinique du Parc', contactName: 'Nathalie Morin', contactRole: 'Service administratif', phone: '+33478000118', email: 'n.morin@clinique-parc.example' } },
  { id: 'f-0970', number: 'F-2026-0970', profile: 'mauvais', dueDaysAgo: -6, amountEur: 21_300, mission: '5 couvreurs, chantier Villeurbanne', debtor: { company: 'Toitures du Lyonnais', contactName: 'Jérôme Faure', contactRole: 'Gérant', phone: '+33472000119', email: 'j.faure@toitures-lyonnais.example' } },
  { id: 'f-0971', number: 'F-2026-0971', profile: 'fiable', dueDaysAgo: -8, amountEur: 6_980, mission: '3 préparateurs, semaine 39', debtor: { company: 'Pharma Logistique Est', contactName: 'Karim Saïdi', contactRole: 'Comptable', phone: '+33472000120', email: 'k.saidi@pharmalog-est.example' } },
  { id: 'f-0972', number: 'F-2026-0972', profile: 'absent', dueDaysAgo: -9, amountEur: 4_420, mission: '2 agents de quai, semaine 39', debtor: { company: 'Transports Saône Express', contactName: 'Michel Vidal', contactRole: 'Gérant', phone: '+33474000121', email: 'contact@saone-express.example' } },
  { id: 'f-0925', number: 'F-2026-0925', profile: 'renvoi', dueDaysAgo: 12, amountEur: 14_200, mission: '4 frigoristes, juillet et août', debtor: { company: 'Froid Service 69', contactName: 'Laure Masson', contactRole: 'Comptabilité', phone: '+33472000108', email: 'l.masson@froidservice69.example' } },
]

/** This morning at 08:00, local time: today's 10:00 actions are still ahead. */
function thisMorning(): number {
  const date = new Date()
  date.setHours(8, 0, 0, 0)
  return date.getTime()
}

export function seedInvoices(): Invoice[] {
  const morning = thisMorning()
  return LINES.map(line => {
    const due = new Date(morning - line.dueDaysAgo * DAY_MS)
    due.setHours(0, 0, 0, 0)
    const dueIso = due.toISOString()
    const bare: Invoice = {
      id: line.id,
      token: `facture-${line.id.slice(2)}`,
      number: line.number,
      debtor: line.debtor,
      mission: line.mission,
      amountEur: line.amountEur,
      dueDate: dueIso,
      status: 'a_relancer',
      playbookIndex: 0,
      knows: 'Échue, la séquence de relance démarre',
      profile: line.profile,
      promises: [],
      calls: [],
      emails: [],
      activities: [],
      updatedAt: dueIso,
    }
    const opened = logActivity(bare, { kind: 'etape', actor: 'autopilote', title: 'Facture échue, séquence démarrée', detail: 'Importée depuis la balance âgée.' }, due.getTime())
    // Replay one day at a time so every action runs on its own date.
    let replayed = opened
    for (let day = due.getTime() + DAY_MS; day <= morning; day += DAY_MS) replayed = runAutopilot(replayed, Math.min(day + 10 * 3_600_000, morning), 'demo')
    return runAutopilot(replayed, morning, 'demo')
  })
}
