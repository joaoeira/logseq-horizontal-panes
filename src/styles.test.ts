import { describe, expect, it } from 'vitest';
import { HORIZONTAL_PANES_STYLES } from './styles';

describe('horizontal panes styles', () => {
  it('keeps the Logseq header fixed across the full viewport', () => {
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /#left-container\s*>\s*\.cp__header[\s\S]*?position:\s*fixed\s*!important/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /#left-container\s*>\s*\.cp__header[\s\S]*?width:\s*100vw\s*!important/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /#left-container[\s\S]*?padding-top:\s*var\(--horizontal-panes-header-height\)/
    );
  });

  it('reserves the fixed header height above sidebar panes', () => {
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item-list[\s\S]*?padding:[\s\S]*?calc\(\s*var\(--horizontal-panes-header-height\)\s*\+\s*18px\s*\)/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item-list\s*>\s*\.sidebar-item[\s\S]*?height:\s*calc\(\s*100vh\s*-\s*var\(--horizontal-panes-header-height\)\s*-\s*46px\s*\)/
    );
  });
});
