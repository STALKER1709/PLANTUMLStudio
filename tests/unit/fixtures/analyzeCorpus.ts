/**
 * Corpus de mesure de l'analyse textuelle.
 *
 * Les descriptions sont écrites **comme on les écrit vraiment** — listes à
 * puces, récits utilisateur, et un dernier texte volontairement narratif —, pas
 * comme les motifs de reconnaissance aimeraient les lire. Le modèle attendu est
 * celui qu'un analyste produirait, sans tenir compte de ce que le programme
 * sait faire : c'est la seule façon d'obtenir un chiffre qui veuille dire
 * quelque chose.
 *
 * Le dernier cas de chaque langue est là pour montrer la limite plutôt que
 * pour la masquer : sur de la prose suivie, l'extraction décroche.
 */

import type { AnalysisLanguage } from '../../../src/renderer/analyze/analyzeText';

export interface ExpectedActor {
  name: string;
  role: 'principal' | 'secondaire';
  inherits?: string;
  useCases: string[];
}

export interface CorpusEntry {
  id: string;
  language: AnalysisLanguage;
  /** `true` pour un texte narratif, dont on n'attend pas un bon score. */
  narratif?: boolean;
  text: string;
  expected: ExpectedActor[];
}

export const CORPUS: ReadonlyArray<CorpusEntry> = [
  {
    id: 'fr-bibliotheque',
    language: 'fr',
    text: `Gestion de bibliothèque

L'adhérent peut rechercher un ouvrage et réserver un ouvrage.
L'adhérent peut emprunter un ouvrage.
Le bibliothécaire hérite de l'adhérent.
Le bibliothécaire peut enregistrer un retour et relancer un adhérent.
Le système doit permettre au bibliothécaire de consulter les statistiques.
Le service de messagerie est un service externe.
Emprunter un ouvrage inclut vérifier la disponibilité.`,
    expected: [
      {
        name: 'Adhérent',
        role: 'principal',
        useCases: ['Rechercher un ouvrage', 'Réserver un ouvrage', 'Emprunter un ouvrage'],
      },
      {
        name: 'Bibliothécaire',
        role: 'principal',
        inherits: 'Adhérent',
        useCases: ['Enregistrer un retour', 'Relancer un adhérent', 'Consulter les statistiques'],
      },
      { name: 'Service de messagerie', role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'fr-boutique',
    language: 'fr',
    text: `Boutique en ligne

- Le visiteur peut parcourir le catalogue.
- Le visiteur peut créer un compte.
- Le client hérite du visiteur.
- En tant que client, je veux passer une commande et suivre ma livraison.
- Le système doit permettre au client de noter un produit.
- L'administrateur peut gérer le catalogue et modérer les avis.
- Le transporteur est un partenaire externe.
- Passer une commande inclut payer la commande.`,
    expected: [
      {
        name: 'Visiteur',
        role: 'principal',
        useCases: ['Parcourir le catalogue', 'Créer un compte'],
      },
      {
        name: 'Client',
        role: 'principal',
        inherits: 'Visiteur',
        useCases: ['Passer une commande', 'Suivre ma livraison', 'Noter un produit'],
      },
      {
        name: 'Administrateur',
        role: 'principal',
        useCases: ['Gérer le catalogue', 'Modérer les avis'],
      },
      { name: 'Transporteur', role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'fr-support',
    language: 'fr',
    text: `Support informatique

L'utilisateur peut ouvrir un ticket et consulter l'état de son ticket.
Le technicien peut prendre en charge un ticket, résoudre un ticket et clôturer un ticket.
Le responsable hérite du technicien.
Le responsable peut réaffecter un ticket.
L'annuaire d'entreprise est un système externe.
Ouvrir un ticket inclut s'authentifier.
Résoudre un ticket peut être étendu par escalader au fournisseur.`,
    expected: [
      {
        name: 'Utilisateur',
        role: 'principal',
        useCases: ['Ouvrir un ticket', "Consulter l'état de son ticket"],
      },
      {
        name: 'Technicien',
        role: 'principal',
        useCases: ['Prendre en charge un ticket', 'Résoudre un ticket', 'Clôturer un ticket'],
      },
      {
        name: 'Responsable',
        role: 'principal',
        inherits: 'Technicien',
        useCases: ['Réaffecter un ticket'],
      },
      { name: "Annuaire d'entreprise", role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'fr-rh',
    language: 'fr',
    text: `Portail RH

Le salarié peut déposer une demande de congé.
Le manager valide les demandes de son équipe.
Le manager peut consulter le solde de congés d'un salarié.
Le service de paie est un système externe.
Déposer une demande de congé inclut vérifier le solde.`,
    expected: [
      { name: 'Salarié', role: 'principal', useCases: ['Déposer une demande de congé'] },
      {
        name: 'Manager',
        role: 'principal',
        useCases: ['Valider les demandes de son équipe', "Consulter le solde de congés d'un salarié"],
      },
      { name: 'Service de paie', role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'fr-covoiturage-narratif',
    language: 'fr',
    narratif: true,
    text: `Application de covoiturage

Notre application met en relation des conducteurs et des passagers. Le conducteur propose un trajet en indiquant son itinéraire et ses horaires. De son côté, le passager recherche un trajet puis réserve une place. Lorsqu'une réservation est confirmée, les deux parties reçoivent les coordonnées de l'autre. Le paiement est confié à un prestataire externe.`,
    expected: [
      { name: 'Conducteur', role: 'principal', useCases: ['Proposer un trajet'] },
      {
        name: 'Passager',
        role: 'principal',
        useCases: ['Rechercher un trajet', 'Réserver une place'],
      },
      { name: 'Prestataire de paiement', role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'en-bookstore',
    language: 'en',
    text: `Online bookstore

A visitor can browse the catalogue and create an account.
The registered customer inherits from the visitor.
The registered customer can place an order and track a delivery.
As a warehouse clerk, I want to prepare a shipment.
The system shall allow the registered customer to pay an order.
The payment gateway is an external service.
Place an order includes authenticate.`,
    expected: [
      {
        name: 'Visitor',
        role: 'principal',
        useCases: ['Browse the catalogue', 'Create an account'],
      },
      {
        name: 'Registered customer',
        role: 'principal',
        inherits: 'Visitor',
        useCases: ['Place an order', 'Track a delivery', 'Pay an order'],
      },
      { name: 'Warehouse clerk', role: 'principal', useCases: ['Prepare a shipment'] },
      { name: 'Payment gateway', role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'en-helpdesk',
    language: 'en',
    text: `Helpdesk

An employee can open a ticket and check the status of a ticket.
A technician can take a ticket, solve a ticket and close a ticket.
The supervisor inherits from the technician.
The supervisor can reassign a ticket.
The directory is an external system.
Open a ticket includes authenticate.`,
    expected: [
      {
        name: 'Employee',
        role: 'principal',
        useCases: ['Open a ticket', 'Check the status of a ticket'],
      },
      {
        name: 'Technician',
        role: 'principal',
        useCases: ['Take a ticket', 'Solve a ticket', 'Close a ticket'],
      },
      {
        name: 'Supervisor',
        role: 'principal',
        inherits: 'Technician',
        useCases: ['Reassign a ticket'],
      },
      { name: 'Directory', role: 'secondaire', useCases: [] },
    ],
  },
  {
    id: 'en-carpool-narrative',
    language: 'en',
    narratif: true,
    text: `Carpooling application

Our application connects drivers with passengers. The driver publishes a trip, giving the route and the schedule. The passenger, on the other hand, searches a trip and then books a seat. Once a booking is confirmed, both parties receive each other's details. Payment is handled by an external provider.`,
    expected: [
      { name: 'Driver', role: 'principal', useCases: ['Publish a trip'] },
      { name: 'Passenger', role: 'principal', useCases: ['Search a trip', 'Book a seat'] },
      { name: 'Payment provider', role: 'secondaire', useCases: [] },
    ],
  },
];
