import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { HomePageComponent } from './features/home/home-page.component';
import { NotFoundPageComponent } from './features/not-found/not-found-page.component';

describe('routes', () => {
  const harness = async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    return RouterTestingHarness.create();
  };

  it("REQ-WEB-002 '' route resolves to HomePageComponent", async () => {
    const component = await (await harness()).navigateByUrl('/', HomePageComponent);

    expect(component).toBeInstanceOf(HomePageComponent);
  });

  it('REQ-PAGE-001 unknown paths and /404 resolve to NotFoundPageComponent', async () => {
    const h = await harness();

    expect(await h.navigateByUrl('/no-such-page', NotFoundPageComponent)).toBeInstanceOf(
      NotFoundPageComponent,
    );
    expect(await h.navigateByUrl('/404', NotFoundPageComponent)).toBeInstanceOf(
      NotFoundPageComponent,
    );
  });
});
