import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { appConfig } from './app.config';

describe('app config', () => {
  it('REQ-WEB-001 app runs without Zone.js', async () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();

    TestBed.configureTestingModule({ imports: [AppComponent], providers: appConfig.providers });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement).toBeInstanceOf(HTMLElement);
    expect(fixture.componentRef.hostView.destroyed).toBe(false);
  });
});
