import { describe, expect, it } from 'vitest';
import { parseJoinQr } from '@/join/parseJoinQr';
import { validateCodeInput } from '@/join/codeInput';

const ORIGIN = 'https://werewolf.example.app';

describe('parseJoinQr', () => {
  it('accepts a join link on the same origin', () => {
    expect(parseJoinQr(`${ORIGIN}/join?code=K7QX`, ORIGIN)).toBe('K7QX');
  });
  it('accepts a trailing slash and .html variant, and uppercases a lowercase code', () => {
    expect(parseJoinQr(`${ORIGIN}/join/?code=k7qx`, ORIGIN)).toBe('K7QX');
    expect(parseJoinQr(`${ORIGIN}/join.html?code=K7QX`, ORIGIN)).toBe('K7QX');
  });
  it('rejects another origin, a look-alike host and another scheme', () => {
    expect(parseJoinQr('https://evil.example/join?code=K7QX', ORIGIN)).toBeNull();
    expect(parseJoinQr('https://werewolf.example.app.evil.example/join?code=K7QX', ORIGIN)).toBeNull();
    expect(parseJoinQr('http://werewolf.example.app/join?code=K7QX', ORIGIN)).toBeNull();
  });
  it('rejects another path', () => {
    expect(parseJoinQr(`${ORIGIN}/host?code=K7QX`, ORIGIN)).toBeNull();
    expect(parseJoinQr(`${ORIGIN}/join/extra?code=K7QX`, ORIGIN)).toBeNull();
  });
  it('rejects a bad or missing code', () => {
    expect(parseJoinQr(`${ORIGIN}/join?code=K7Q`, ORIGIN)).toBeNull();
    expect(parseJoinQr(`${ORIGIN}/join?code=K7QO`, ORIGIN)).toBeNull();
    expect(parseJoinQr(`${ORIGIN}/join?code=K7QXX`, ORIGIN)).toBeNull();
    expect(parseJoinQr(`${ORIGIN}/join`, ORIGIN)).toBeNull();
  });
  it('rejects garbage and script URLs', () => {
    expect(parseJoinQr('hello world', ORIGIN)).toBeNull();
    expect(parseJoinQr('', ORIGIN)).toBeNull();
    expect(parseJoinQr('javascript:alert(1)', ORIGIN)).toBeNull();
    expect(parseJoinQr(`${ORIGIN}/join?code=K7QX`, 'not an origin')).toBeNull();
  });
});

describe('validateCodeInput', () => {
  it('accepts and uppercases a valid code', () => {
    expect(validateCodeInput(' k7qx ')).toEqual({ ok: true, code: 'K7QX' });
  });
  it('explains empty, short and invalid codes', () => {
    expect(validateCodeInput('')).toMatchObject({ ok: false });
    expect(validateCodeInput('K7')).toMatchObject({ ok: false, message: 'The code has 4 characters.' });
    expect(validateCodeInput('K7Q0')).toMatchObject({ ok: false });
  });
});
