import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { HomePageComponent } from './features/home/home-page.component';

describe('routes', () => {
  it("REQ-WEB-002 '' route resolves to HomePageComponent", async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });

    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/', HomePageComponent);

    expect(component).toBeInstanceOf(HomePageComponent);
  });
});
