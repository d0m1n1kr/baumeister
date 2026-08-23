// Register der Karten-Sets/Erweiterungen. Neue Erweiterungen werden hier
// eingetragen; ihre Karten kommen als JSON-Assets mit passendem "set"-Feld dazu.

export interface SetInfo {
  id: string;
  name: string;
  description: string;
  /** Immer aktiv (nicht abwählbar). */
  core?: boolean;
  /** Zusätzliches Spielsystem, das die Engine aktiviert. */
  system?: 'coins' | 'trees';
}

export function systemActive(sets: string[], system: SetInfo['system']): boolean {
  return SETS.some((s) => s.system === system && sets.includes(s.id));
}

export const SETS: SetInfo[] = [
  {
    id: 'base',
    name: 'Basisspiel',
    description: '25 Gebäude + 15 Monumente',
    core: true
  },
  {
    id: 'fortune',
    name: 'Fortune',
    description: 'Münzen: 1 Münze bei 2+ Bauten pro Runde; 1 Münze zahlen, um ein anderes Material zu nehmen. 12 Gebäude + 10 Monumente.',
    system: 'coins'
  },
  {
    id: 'tiny_trees',
    name: 'Tiny Trees',
    description: 'Mini-Erweiterung: Jeder startet mit einem Samen. Überbauen bringt ein Gratis-Material; als letzter freier Platz wird er ein Baum (2 Punkte).',
    system: 'trees'
  }
];
