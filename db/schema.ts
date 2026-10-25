import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const albums = sqliteTable('albums', { id:text('id').primaryKey(), token:text('token').notNull().unique(), title:text('title').notNull(), client:text('client').notNull(), date:text('date').notNull(), published:integer('published').notNull().default(0), created:integer('created').notNull() });
export const photos = sqliteTable('photos', { id:text('id').primaryKey(), album:text('album').notNull().references(()=>albums.id), name:text('name').notNull(), mime:text('mime').notNull(), size:integer('size').notNull(), created:integer('created').notNull() });
export const sessions = sqliteTable('sessions', { id:text('id').primaryKey(), expires:integer('expires').notNull() });
export const attempts = sqliteTable('attempts', { id:text('id').primaryKey(), count:integer('count').notNull(), since:integer('since').notNull() });
export const selections = sqliteTable('selections', { id:text('id').primaryKey(), album:text('album').notNull().references(()=>albums.id), name:text('name').notNull(), photos:text('photos').notNull(), created:integer('created').notNull() });
