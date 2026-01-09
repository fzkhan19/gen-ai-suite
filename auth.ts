import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google,
    Credentials({
      name: "StartUp Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "admin" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const staticUsername = process.env.STATIC_USERNAME
        const staticPassword = process.env.STATIC_PASSWORD

        if (
          credentials?.username === staticUsername &&
          credentials?.password === staticPassword
        ) {
          return { name: "Admin User", email: "admin@local" }
        }
        return null
      }
    })
  ],
  callbacks: {
    authorized: async ({ auth }) => {
      // Logged in users are authenticated, otherwise redirect to login
      if (!auth) {
        return false
      }

      // Strict Email Allowlist
      const userEmail = auth.user?.email
      const authorizedEmail = process.env.AUTHORIZED_EMAIL

      if (authorizedEmail && userEmail !== authorizedEmail && userEmail !== "admin@local") {
        return false // Deny access if email doesn't match
      }

      return true
    },
  },
  pages: {
    signIn: "/login",
  },
})
