using QueryTool.Core;

namespace QueryTool.Infrastructure;

public sealed class BCryptPasswordHasher : IPasswordHasher
{
    // Work factor: increase for stronger but slower hashing (10–12 recommended)
    private const int WORK_FACTOR = 12;

    public string Hash(string password)
    {
        if (string.IsNullOrWhiteSpace(password))
            throw new ArgumentException("Password cannot be empty.", nameof(password));

        return BCrypt.Net.BCrypt.HashPassword(password, workFactor: WORK_FACTOR);
    }

    public bool Verify(string hashedPassword, string providedPassword)
    {
        if (string.IsNullOrWhiteSpace(hashedPassword) || string.IsNullOrWhiteSpace(providedPassword))
            return false;

        return BCrypt.Net.BCrypt.Verify(providedPassword, hashedPassword);
    }
}
