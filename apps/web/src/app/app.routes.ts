import { Routes } from '@angular/router';

const notFound = () =>
  import('./features/not-found/not-found-page.component').then((m) => m.NotFoundPageComponent);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home-page.component').then((m) => m.HomePageComponent),
  },
  {
    path: 'experience',
    loadComponent: () =>
      import('./features/experience/experience-page.component').then(
        (m) => m.ExperiencePageComponent,
      ),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/projects-page.component').then((m) => m.ProjectsPageComponent),
  },
  {
    path: 'projects/:slug',
    loadComponent: () =>
      import('./features/projects/project-page.component').then((m) => m.ProjectPageComponent),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/about/about-page.component').then((m) => m.AboutPageComponent),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/contact/contact-page.component').then((m) => m.ContactPageComponent),
  },
  // Prerendered to /404/index.html; scripts/emit-404.mjs copies it to 404.html for the host.
  { path: '404', loadComponent: notFound },
  { path: '**', loadComponent: notFound },
];
