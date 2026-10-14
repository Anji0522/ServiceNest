const isRepositoryPagesPath = (pathname) => pathname === '/ServiceNET' || pathname.startsWith('/ServiceNET/');

try {
  const pendingRoute = JSON.parse(sessionStorage.getItem('servicenest_pages_route') || 'null');
  if (pendingRoute?.pathname) {
    window.history.replaceState(null, '', `${pendingRoute.pathname}${pendingRoute.search || ''}${pendingRoute.hash || ''}`);
    sessionStorage.removeItem('servicenest_pages_route');
  }
} catch {
  sessionStorage.removeItem('servicenest_pages_route');
}

export const routePath = () => {
  const basePath = isRepositoryPagesPath(window.location.pathname) ? '/ServiceNET' : '';
  const path = window.location.pathname.slice(basePath.length) || '/';
  return path.startsWith('/') ? path : `/${path}`;
};

export const navigateToRoute = (path, replace = false) => {
  const basePath = isRepositoryPagesPath(window.location.pathname) ? '/ServiceNET' : '';
  const target = `${basePath}${path === '/' ? '/' : path}`;
  if (replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
