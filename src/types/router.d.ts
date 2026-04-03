import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    description?: string
    ogImage?: string
    robots?: string
    requiresAuth?: boolean
    requiresGuest?: boolean
  }
}
