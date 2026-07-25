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
      /\.sidebar-item\.horizontal-panes-last-pane:not\(\.collapsed\):not\(\.horizontal-panes-manual-width\)[\s\S]*?flex:\s*1\s+1\s+var\(--horizontal-panes-pane-width\)\s*!important/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item\.horizontal-panes-last-pane:not\(\.collapsed\):not\(\.horizontal-panes-manual-width\)[\s\S]*?max-width:\s*var\(--horizontal-panes-last-pane-max-width\)\s*!important/
    );
  });

  it('uses an individual width override and exposes resize feedback', () => {
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item\s*\{[\s\S]*?flex:\s*0\s+0\s+var\(\s*--horizontal-panes-pane-width-override,\s*var\(--horizontal-panes-pane-width\)\s*\)\s*!important/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /body\.horizontal-panes-pane-resize-target[\s\S]*?cursor:\s*col-resize\s*!important/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /body\.horizontal-panes-pane-resizing[\s\S]*?user-select:\s*none\s*!important/
    );
  });

  it('styles pane history as native-sized header controls and hides it when collapsed', () => {
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.horizontal-panes-history-controls[\s\S]*?display:\s*inline-flex/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.horizontal-panes-history-controls\s*>\s*button[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/
    );
    expect(HORIZONTAL_PANES_STYLES).toMatch(
      /\.sidebar-item\.collapsed\s+\.horizontal-panes-history-controls[\s\S]*?display:\s*none\s*!important/
    );
  });
});
