export function userCsv(user) {
  return [user.id, user.name, user.email].join(',');
}
