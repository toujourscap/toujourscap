import { onRequestGet as __admin_commentaires_js_onRequestGet } from "/home/claude/toujourscap/functions/admin/commentaires.js"
import { onRequestPost as __admin_commentaires_js_onRequestPost } from "/home/claude/toujourscap/functions/admin/commentaires.js"
import { onRequestGet as __api_commentaires_js_onRequestGet } from "/home/claude/toujourscap/functions/api/commentaires.js"
import { onRequestPost as __api_commentaires_js_onRequestPost } from "/home/claude/toujourscap/functions/api/commentaires.js"

export const routes = [
    {
      routePath: "/admin/commentaires",
      mountPath: "/admin",
      method: "GET",
      middlewares: [],
      modules: [__admin_commentaires_js_onRequestGet],
    },
  {
      routePath: "/admin/commentaires",
      mountPath: "/admin",
      method: "POST",
      middlewares: [],
      modules: [__admin_commentaires_js_onRequestPost],
    },
  {
      routePath: "/api/commentaires",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_commentaires_js_onRequestGet],
    },
  {
      routePath: "/api/commentaires",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_commentaires_js_onRequestPost],
    },
  ]