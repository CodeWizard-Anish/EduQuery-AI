const User = require("../models/User");

/**
 * Seeds default Faculty / Admin account if none exists in database,
 * and ensures faculty name is "Dr. Anish".
 */
const seedFacultyUser = async () => {
  try {
    const facultyEmail = "faculty@eduquery.edu";
    const existing = await User.findOne({ email: facultyEmail });

    if (!existing) {
      const passwordHash = await User.hashPassword("Faculty@123");
      const seeded = await User.create({
        name: "Dr. Anish",
        email: facultyEmail,
        passwordHash,
        role: "faculty",
        department: "Computer Science & Engineering",
      });
      console.log(`[Seed] Created default Faculty account: ${seeded.email} (Name: Dr. Anish, Password: Faculty@123)`);
    } else {
      if (existing.name !== "Dr. Anish") {
        existing.name = "Dr. Anish";
        await existing.save();
        console.log(`[Seed] Updated Faculty account name to Dr. Anish for: ${facultyEmail}`);
      } else {
        console.log(`[Seed] Faculty account verified: ${facultyEmail} (Dr. Anish)`);
      }
    }

    // Also update any other users with old name
    await User.updateMany({ name: "Dr. Anish Sharma" }, { $set: { name: "Dr. Anish" } });
  } catch (error) {
    console.warn("[Seed] Faculty seeding error (non-fatal):", error.message);
  }
};

module.exports = seedFacultyUser;
