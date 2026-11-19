import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render } from '@testing-library/angular';
import { RouteFocus } from './route-focus';

@Component({
  selector: 'sf-host',
  template: `<main id="main" tabindex="-1">
    <h1>Experience</h1>
    <article id="2024-11-rebit"><h2>Role</h2></article>
  </main>`,
})
class HostComponent {}

describe('RouteFocus', () => {
  it('REQ-UI-005 focuses the element named by the URL fragment when it exists', async () => {
    await render(HostComponent);

    TestBed.inject(RouteFocus).focusTarget('2024-11-rebit');

    expect(document.activeElement?.id).toBe('2024-11-rebit');
  });

  it('REQ-UI-005 falls back to the main heading', async () => {
    await render(HostComponent);

    TestBed.inject(RouteFocus).focusTarget('missing');

    expect(document.activeElement?.tagName).toBe('H1');
  });
});
