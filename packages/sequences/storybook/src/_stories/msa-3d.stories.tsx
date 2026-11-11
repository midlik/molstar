/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * Developed in collaboration with Anyfold <https://anyfold.ai/>
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Adam Midlik <midlik@gmail.com>
 */

// pnpm build
// pnpm -C storybook storybook

import { button, type DomPart, type RowProps as DomRowProps, setAttr } from '@molstar/seq-viewer/dom';
import type { RowProps } from '@molstar/seq-viewer/react';
import type { Meta, StoryObj } from './support/seqstar-story.js';
import { useEffect, useRef, useState } from 'react';
import { familyFromFasta } from '../../../viewer/_test/families-msa-3d.js';
import fastaAlignment from '../../../core/_test/fixtures/3SN6_align.fasta?raw';
import { PrismPage } from './support/seqstar-prism.js';
import { ViewerCard } from './support/seqstar-viewer.js';
import s from './support/seqstar-viewer.module.css';
import { type Args, viewerControls } from './support/seqstar-viewer-args.js';
import { Tooltip } from './ui/index.js';
import type { PluginContext } from '@molstar/plugin/context';
import { mountPlugin, showMvs } from './support/seqstar-molstar-plugin.js';
import { structureMvs } from './support/seqstar-mvs.js';
import m from './support/seqstar-molstar.module.css';

const meta = {
  title: 'Seq*/Views and layouts/MSA with 3D',
  ...viewerControls,
  parameters: { ...viewerControls.parameters, layout: 'fullscreen' },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

const TREE_FAMILY = familyFromFasta(fastaAlignment, 16, { columns: true, sites: false });

type RowToggleCallback = (on: boolean, dataRow: number) => void;

function RowToggle({ dataRow, clickCallback }: RowProps & { clickCallback: RowToggleCallback }) {
  const [on, setOn] = useState(false);
  return (
    <Tooltip content={`Show row ${dataRow + 1} in 3D`}>
      <button
        type="button"
        className={s.rowToggle}
        aria-pressed={on}
        aria-label={`Show row ${dataRow + 1} in 3D`}
        onClick={() => {
          setOn(!on);
          clickCallback(!on, dataRow);
        }}
      >
        3D
      </button>
    </Tooltip>
  );
}

const ROW_UI_WITH_CALLBACK = (clickCallback: RowToggleCallback) => ({
  components: { RowControl: (props: RowProps) => RowToggle({ ...props, clickCallback }) },
});

const domRowToggle: DomPart<DomRowProps> = (host, _ctx, { dataRow }) => {
  const label = `Show row ${dataRow + 1} in 3D`;
  const toggle = button(
    { class: 'seqv-choice', 'aria-pressed': false, 'aria-label': label },
    () => {
      setAttr(toggle, 'aria-pressed', toggle.getAttribute('aria-pressed') !== 'true');
    },
    '3D',
  );
  host.append(toggle);
  return { dispose: () => toggle.remove() };
};
const ROW_DOM = { RowControl: domRowToggle };

function structureFormat(url: string): 'bcif' | 'mmcif' | 'pdb' {
  const pathname = new URL(url, window.location.href).pathname.toLowerCase();
  if (pathname.endsWith('.bcif')) return 'bcif';
  if (pathname.endsWith('.cif') || pathname.endsWith('.mmcif')) return 'mmcif';
  if (pathname.endsWith('.pdb')) return 'pdb';
  throw new Error('Use a .bcif, .cif, .mmcif, or .pdb structure URL.');
}

function structuresMvs(urls: readonly string[]) {
  const states = urls.map((url) => structureMvs({ url, format: structureFormat(url) }));
  const first = states[0];
  if (!first) return null;
  return {
    ...first,
    root: {
      ...first.root,
      children: states.flatMap((state) => state.root.children ?? []),
    },
  };
}

function parseRowLabel(label: string): { pdbId: string; structureUrl: string; chainId: string } {
  let [pdbId, chainId] = label.split('_');
  pdbId = pdbId.toLowerCase();
  const structureUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}.bcif`;
  return { pdbId, structureUrl, chainId };
}

function RowControlsMolstarView({ args }: { args: Args }) {
  const host = useRef<HTMLDivElement>(null);
  const [plugin, setPlugin] = useState<PluginContext | null>(null);
  const [label, setLabel] = useState('3SN6_R');
  const [status, setStatus] = useState('Starting Mol*…');
  const [loading, setLoading] = useState(false);
  const [loadedStructureLabels, setLoadedStructureLabels] = useState<string[]>([]);
  const loadedStructureLabelsRef = useRef<string[]>([]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    let made: PluginContext | null = null;
    void mountPlugin(el)
      .then((p) => {
        made = p;
        if (live) {
          setPlugin(p);
          setStatus('Ready. No structure is loaded.');
        } else {
          p.dispose();
        }
      })
      .catch((e: unknown) => {
        if (live) setStatus(`Could not start Mol*: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      live = false;
      setPlugin(null);
      made?.dispose();
    };
  }, []);

  const loadStructure = async (label: string) => {
    if (!plugin || loading) return;
    setLoading(true);
    try {
      if (loadedStructureLabelsRef.current.includes(label)) {
        setStatus(`Already loaded ${label}.`);
        return;
      }
      const nextLabels = [...loadedStructureLabelsRef.current, label];
      const nextUrls = nextLabels.map((rowLabel) => parseRowLabel(rowLabel).structureUrl);
      setStatus(`Loading ${label}…`);
      const state = structuresMvs(nextUrls);
      const structure = state ? await showMvs(plugin, state) : null;
      if (!structure) {
        setStatus('No structure was loaded.');
        return;
      }
      loadedStructureLabelsRef.current = nextLabels;
      setLoadedStructureLabels(nextLabels);
      setStatus(`Loaded ${label}.`);
    } catch (e) {
      setStatus(`Could not load structure: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const unloadStructure = async (label: string) => {
    if (!plugin || loading || !loadedStructureLabelsRef.current.includes(label)) return;
    setLoading(true);
    setStatus(`Unloading ${label}…`);
    try {
      const nextLabels = loadedStructureLabelsRef.current.filter((loadedLabel) => loadedLabel !== label);
      const nextUrls = nextLabels.map((rowLabel) => parseRowLabel(rowLabel).structureUrl);
      const state = structuresMvs(nextUrls);
      if (state) {
        await showMvs(plugin, state);
      } else {
        const structures = plugin.managers.structure.hierarchy.current.structures;
        await plugin.managers.structure.hierarchy.remove(structures, false);
      }
      loadedStructureLabelsRef.current = nextLabels;
      setLoadedStructureLabels(nextLabels);
      setStatus(nextLabels.length ? `Unloaded ${label}.` : 'Ready. No structure is loaded.');
    } catch (e) {
      setStatus(`Could not unload structure: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PrismPage
      title="Row controls and an empty Mol* viewer"
      caption={
        <>
          The host's component in the `RowControl` slot, in the header's last 40 px (render prop `controlWidth`); only
          the rows in view get one, and they follow the rows' scroll by a transform. Toggle a row's 3D control or enter
          a row label (for example, 3SN6_R) to load its structure.
        </>
      }
    >
      <ViewerCard
        doc={TREE_FAMILY.document}
        label="The 3SN6 alignment, a control beside each row"
        ui={ROW_UI_WITH_CALLBACK((on, iRow) => {
          const rowLabel = TREE_FAMILY.labels[iRow];
          console.log('callbalck', on, iRow, rowLabel);
          void (on ? loadStructure(rowLabel) : unloadStructure(rowLabel));
        })}
        domSlots={ROW_DOM}
        options={{
          navigator: args.navigator,
          rowsColor: args.rowsColor,
          ui: args.ui,
          render: { controlWidth: 40, headerWidth: 230 },
        }}
      />
      <section className={m.stage}>
        <div className={m.chooser}>
          <label>
            Row label <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <button type="button" disabled={!plugin || loading} onClick={() => void loadStructure(label)}>
            Load structure
          </button>
          <span role="status">{status}</span>
        </div>
        {loadedStructureLabels.map((loadedLabel) => (
          <div key={loadedLabel} className={m.chooser}>
            <span>{loadedLabel}</span>
            <button type="button" disabled={loading} onClick={() => void unloadStructure(loadedLabel)}>
              Unload structure
            </button>
          </div>
        ))}
        <div ref={host} className={m.canvas} aria-label="Mol* structure viewer" />
      </section>
    </PrismPage>
  );
}

// https://wwwdev.ebi.ac.uk/pdbe/entry-files/download/1cbs.bcif
export const MsaWith3D: Story = {
  name: 'Demo of MSA with 3D',
  render: (args) => <RowControlsMolstarView args={args} />,
};
