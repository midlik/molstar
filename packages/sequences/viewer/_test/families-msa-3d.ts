/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * Developed in collaboration with Anyfold <https://anyfold.ai/>
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Adam Midlik <midlik@gmail.com>
 */

// A synthetic protein family for vertical scrolling, the overview and row zoom (synthetic: not real sequences): the
// SH2 excerpt's rows (case 3) as seeds, each member a seed with deterministic substitutions and an occasional gap.
// No file, no network: an alignment by value, a box section of `height_rows` rows under a ruler and a conservation track.

import { createSeqViewSpec } from '@molstar/seq-core/builder';
import { Fasta } from '@molstar/seq-core/model';


/** An aligned FASTA family, with a generated tree and optional synthetic member columns and sites. */
export function familyFromFasta(fasta: string, heightRows: number, o: { columns?: boolean; sites?: boolean } = {}) {
  const parsed = Fasta.parse(fasta);
  const { input, issues } = Fasta.alignment(parsed.records, 'family', 'a3m');
  const issue = [...parsed.issues, ...issues].find((i) => i.severity === 'error');
  if (issue) throw new Error(issue.message);
  const labels = input.labels ?? input.gapped.map((_, k) => `row-${k + 1}`);
  const n = input.gapped.length;
  if (!n) throw new Error('The FASTA alignment has no rows.');
  if (labels.length !== n || labels.some((label) => !label) || new Set(labels).size !== n) {
    throw new Error('The FASTA alignment must have unique, non-empty row labels.');
  }

  const clade = (ks: number[], depth: number): string =>
    ks.length === 1
      ? `'${labels[ks[0]].replaceAll("'", "''")}':${(0.05 + (ks[0] % 3) * 0.03).toFixed(2)}`
      : `(${clade(ks.slice(0, ks.length >> 1), depth + 1)},${clade(ks.slice(ks.length >> 1), depth + 1)}):${(0.3 / (depth + 1)).toFixed(2)}`;
  const columnCount = Math.max(...input.gapped.map((row) => row.length));
  // The fixture's records differ by two terminal columns; fill the short rows with terminal gaps.
  const gapped = input.gapped.map((row) => row.padEnd(columnCount, '-'));
  const newick = `${clade(
    Array.from({ length: n }, (_, k) => k),
    0,
  )};`;
  const b = createSeqViewSpec({ title: 'A FASTA family alignment with a synthetic tree' });
  const aln = b.data.alignment({ ref: 'family', value: gapped, labels, flavor: 'aligned' });
  aln.tree({ source: { value: newick, format: 'newick' } });
  const v = b.view({ ref: 'fam', label: 'Family', style: 'msa', height: 'box', height_rows: heightRows });
  v.block({ alignment: aln });
  v.track({ label: '' }).ruler();
  const members = v.track({ label: 'Members' });
  const meta = o.columns
    ? b.data.annotation({
      ref: 'meta',
      geometry: 'rows',
      target: aln,
      value: {
        row: Array.from({ length: n }, (_, k) => k),
        length: Array.from({ length: n }, (_, k) => 28 + (k % 3)),
      },
    })
    : null;
  members.rows(
    meta
      ? {
        data_columns: [
          { data: meta, field: 'length', label: 'Len', type: 'number' },
        ],
      }
      : {},
  );
  if (o.sites) {
    const sites = b.data.annotation({
      ref: 'sites',
      geometry: 'ranges',
      target: aln,
      numbering: 'ordinal',
      value: {
        target: [aln.row(0), aln.row(Math.min(5, n - 1))],
        start: [3, 10],
        category: ['Active site', 'Binding site'],
      },
    } as never);
    members.points({ data: sites });
  }
  return { labels: labels, document: b.getDocument() };
}
