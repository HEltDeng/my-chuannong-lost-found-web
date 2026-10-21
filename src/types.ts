export type Kind = 'lost' | 'found';
export type Item = { id: string; kind: Kind; title: string; campus: string; location: string; time: string; date: string; image: string; description: string; contact: string; mine?: boolean; done?: boolean; status?: string; createdAt?: number; updatedAt?:number; moderationNote?:string; ownerName?:string };
export type ReviewNotice={id:string;post_id:string;title:string;post_type:Kind;action:'approve'|'reject'|'take_down';status:string;reason:string;created_at:number;read_at:number|null};
