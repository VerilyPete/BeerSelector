/**
 * Pins the FlatList virtualization config, which is deliberate and which
 * nothing else in the repo records.
 *
 * This is a change-detector, not a performance test. It cannot tell you the
 * list is fast — only that nobody moved these numbers without meaning to. Real
 * performance is measured by Flashlight (`npm run test:performance`) and by
 * Maestro; see TESTING.md.
 *
 * HISTORY, because the numbers here have been wrong before. This file replaces
 * a 26-test suite written as a RED-first spec for "MP-3 Step 2a / Bottleneck
 * #6". That spec predicted windowSize 21 -> 11 while HOLDING initialNumToRender
 * and maxToRenderPerBatch at 20 and removeClippedSubviews at true, and said so
 * in its header: "Current Status: SUBOPTIMAL ... These tests will pass after
 * Step 2b implementation." Step 2b shipped something different — 15/15/11/false
 * — and the spec was never reconciled with it. It was quarantined in
 * jest.config.js instead, on the stated grounds that it hung, which it does not:
 * it runs in about a second.
 *
 * So nine of its assertions described a component that has not existed since
 * `components/beer/BeerList.tsx` was created, and were red from the first day
 * they were excluded. Eight more asserted arithmetic on constants declared
 * inside the test body — `const WINDOW_SIZE_OPTIMIZED = 11` and then a ratio —
 * which pass no matter what the component does. The rest re-asserted
 * `windowSize === 11` in eight different contexts. The empty-list case it also
 * covered is tested properly in BeerList.test.tsx, three ways, so it is not
 * repeated here.
 *
 * On `removeClippedSubviews={false}`: no commit or doc in this repo records why.
 * Setting it false is the usual guard against blank rows on iOS, and this app is
 * iOS-first, which makes that the likely reason — but that is inference, not a
 * recorded decision. Measure before changing it.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { BeerList } from '../BeerList';
import { BeerWithContainerType } from '@/src/types/beer';

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('../BeerItem', () => ({
  BeerItem: jest.fn(() => null),
}));

describe('BeerList virtualization config', () => {
  const createMockBeer = (id: string): BeerWithContainerType => ({
    id,
    brew_name: `Test Beer ${id}`,
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    added_date: '1234567890',
    brewer_loc: 'Austin, TX',
    brew_container: 'Draft',
    brew_description: 'Test description',
    container_type: 'tulip',
    enrichment_confidence: null,
    enrichment_source: null,
  });

  it('renders the list with the tuned virtualization parameters', () => {
    const beers = Array.from({ length: 200 }, (_, i) => createMockBeer(String(i + 1)));

    const { UNSAFE_getByType } = render(
      <BeerList
        beers={beers}
        loading={false}
        refreshing={false}
        onRefresh={() => {}}
        expandedId={null}
        onToggleExpand={() => {}}
      />
    );

    const flatList = UNSAFE_getByType(FlatList);

    // Asserted together, in one place. The suite this replaced spread the same
    // four values across seventeen tests, which is how nine of them could go
    // stale without anyone noticing the other eight said nothing at all.
    expect(flatList.props.windowSize).toBe(11);
    expect(flatList.props.initialNumToRender).toBe(15);
    expect(flatList.props.maxToRenderPerBatch).toBe(15);
    expect(flatList.props.removeClippedSubviews).toBe(false);
    expect(flatList.props.updateCellsBatchingPeriod).toBe(50);
  });
});
