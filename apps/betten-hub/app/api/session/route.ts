import {respond} from '../../../lib/hub-client';
export async function GET(req:Request){return respond(req,'session')}
