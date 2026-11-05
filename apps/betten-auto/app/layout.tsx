import './provider-research.css';
import type { Metadata } from 'next';
import './globals.css';
import './classic.css';
import './modern-desk.css';
export const metadata: Metadata = {title:'Inventory Desk · Betten Imports',description:'Your private Betten Imports inventory, pricing, appraisal and reconditioning workspace.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
