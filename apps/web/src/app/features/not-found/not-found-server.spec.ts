import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundPageComponent } from './not-found-page.component';

afterEach(() => vi.unstubAllGlobals());

describe('NotFoundPageComponent on the server (REQ-UI-104)', () => {
  it('REQ-UI-104 creating and destroying the 404 page without matchMedia or animation frames throws nothing', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    vi.stubGlobal('matchMedia', undefined);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: 'server' }],
    });

    const fixture = TestBed.createComponent(NotFoundPageComponent);
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
  });
});
