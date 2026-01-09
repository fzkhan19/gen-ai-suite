import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    authorized: async ({ auth }) => {
      // Logged in users are authenticated, otherwise redirect to login
      if (!auth) {
        return false
      }

      // Strict Email Allowlist
      const userEmail = auth.user?.email
      const authorizedEmail = process.env.AUTHORIZED_EMAIL

      if (authorizedEmail && userEmail !== authorizedEmail) {
        return false // Deny access if email doesn't match
      }

      return true
    },
  },
})
