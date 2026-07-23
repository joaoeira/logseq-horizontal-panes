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

  it('uses the secondary surface as the workspace canvas and primary surfaces for content', () => {
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /#app-container[\s\S]*?background:\s*var\(--ls-secondary-background-color\)/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /#left-container[\s\S]*?background:\s*var\(--ls-primary-background-color\)/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item-list\s*>\s*\.sidebar-item\s*\{[\s\S]*?background:\s*var\(--ls-primary-background-color\)/
    );
  });

  it('lets only the last expanded pane absorb spare viewport width up to its cap', () => {
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /#right-sidebar\.open[\s\S]*?min-width:\s*max\(\s*0px,\s*calc\(\s*100vw\s*-\s*var\(--horizontal-panes-main-width\)\s*\)\s*\)/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item\.horizontal-panes-last-pane:not\(\.collapsed\)[\s\S]*?flex:\s*1\s+1\s+var\(--horizontal-panes-pane-width\)\s*!important/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item\.horizontal-panes-last-pane:not\(\.collapsed\)[\s\S]*?max-width:\s*var\(--horizontal-panes-last-pane-max-width\)\s*!important/
    );
  });
});
