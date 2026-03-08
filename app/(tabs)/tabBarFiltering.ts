type Route = { readonly name: string; readonly key: string };

export function filterVisibleRoutes(
  routes: readonly Route[],
  descriptors: Record<string, { options: { href?: string | null } }>,
  isVisitor: boolean,
  tabConfigs: Record<string, { memberOnly?: boolean }>
): readonly Route[] {
  return routes.filter((route) => {
    const cfg = tabConfigs[route.name];
    if (!cfg) return false;
    if (cfg.memberOnly && isVisitor) return false;
    const options = descriptors[route.key].options;
    return options.href !== null;
  });
}
