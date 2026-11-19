import { Routes } from '@angular/router';

const notFound = () =>
  import('./features/not-found/not-found-page.component').then((m) => m.NotFoundPageComponent);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home-page.component').then((m) => m.HomePageComponent),
  },
  // Prerendered to /404/index.html; scripts/emit-404.mjs copies it to 404.html for the host.
  { path: '404', loadComponent: notFound },
  { path: '**', loadComponent: notFound },
];
