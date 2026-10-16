import { describe, expect, test } from 'bun:test';
import { alertPageQuery, getAlertPagination } from './alertPagination';
describe('alert pagination', () => {
  test('preserves the defaults for existing clients', () => expect(alertPageQuery.parse({})).toEqual({page:1,limit:50,unreadOnly:false}));
  test('rejects invalid page sizes, page numbers and filters', () => {
    for(const query of [{page:'0'},{page:'1.5'},{page:'2oops'},{limit:'101'},{limit:'-1'},{unreadOnly:'yes'}]) expect(alertPageQuery.safeParse(query).success).toBe(false);
  });
  test('reaches alerts beyond the previous fifty-record limit', () => expect(getAlertPagination(137,58,5,28)).toEqual({page:28,limit:5,total:137,totalPages:28,unreadCount:58}));
  test('clamps the last page after reading or filtering', () => {
    expect(getAlertPagination(5,5,5,2).page).toBe(1);
    expect(getAlertPagination(0,0,5,2)).toEqual({page:1,limit:5,total:0,totalPages:1,unreadCount:0});
  });
});
