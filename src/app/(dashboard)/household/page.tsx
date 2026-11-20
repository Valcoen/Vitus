import { redirect } from 'next/navigation'

/** The shared plan now lives in the account settings. Old links land there. */
export default function HouseholdPage() {
  redirect('/settings#plan')
}
