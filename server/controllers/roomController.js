const Room = require("../models/Room");
const User = require("../models/User");

// CREATE a room
exports.createRoom = async (req, res) => {
  try {
    const { title, description, location, price, preferences, lat, lng } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images were uploaded." });
    }

    // Correctly map uploaded files to the 'images' schema format
    const images = req.files.map((file) => ({
      url: file.path, // Assuming 'file.path' is the URL to the image
      public_id: file.filename, // Assuming 'file.filename' is the public ID
    }));

    const newRoom = new Room({
      title,
      description,
      location,
      price,
      preferences: preferences.split(",").map((pref) => pref.trim()),
      images, // Use the correct 'images' field with the formatted data
      owner: req.payload.id,
      coordinates: {
        type: "Point",
        coordinates: [parseFloat(lng), parseFloat(lat)],
      },
    });

    await newRoom.save();
    res.status(201).json({ message: "Room created successfully", room: newRoom });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating room", error: err.message });
  }
};

// GET all rooms with advanced search filters
exports.getAllRooms = async (req, res) => {
  try {
    const { location, preference, minPrice, maxPrice } = req.query;
    const filter = {};

    if (location) filter.location = { $regex: location, $options: "i" };
    if (preference) filter.preferences = preference;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Find users who are owners to filter rooms
    const ownerUsers = await User.find({ role: 'owner' }).select('_id');
    const ownerIds = ownerUsers.map(user => user._id);

    // Add owner filter to the query
    filter.owner = { $in: ownerIds };

    const rooms = await Room.find(filter).populate("owner", "email");
    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ message: "Error fetching rooms", error: error.message });
  }
};

exports.getMyRooms = async (req, res) => {
  try {
    const userId = req.payload.id;
    const rooms = await Room.find({ owner: userId }).populate("owner", "email");

    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ message: "Error fetching your rooms", error: error.message });
  }
};

// GET single room by ID
exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate({
        path: 'owner',
        select: 'name email contactInfo',
        options: { strictPopulate: false }
      });
    
    if (!room) return res.status(404).json({ message: "Room not found" });
    
    // Convert to plain object and handle potential null owner
    const roomObj = room.toObject();
    
    // If owner is populated, ensure contactInfo exists
    if (roomObj.owner) {
      roomObj.owner.contactInfo = roomObj.owner.contactInfo || {};
    }
    
    res.status(200).json(roomObj);
  } catch (err) {
    console.error('Error in getRoomById:', err);
    res.status(500).json({ message: "Error fetching room", error: err.message });
  }
};

// UPDATE room (only by owner)
exports.updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      location,
      price,
      preferences,
      lat,
      lng,
      existingImages
    } = req.body;

    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({ message: "Room not found." });
    }

    let updatedImages = [];

    // Handle existing images
    if (existingImages) {
      let parsedImages = existingImages;

      // If sent as JSON string
      if (typeof existingImages === "string") {
        try {
          parsedImages = JSON.parse(existingImages);
        } catch {
          // If it's just a single plain URL string
          parsedImages = [existingImages];
        }
      }

      // Normalize array to always have { url, public_id }
      if (Array.isArray(parsedImages)) {
        updatedImages = parsedImages.map(img => {
          if (typeof img === "string") {
            const filename = img.split("/").pop().split(".")[0] || Date.now().toString();
            return { url: img, public_id: filename };
          }
          return {
            url: img.url,
            public_id: img.public_id || img.url.split("/").pop().split(".")[0] || Date.now().toString()
          };
        });
      } else if (typeof parsedImages === "object" && parsedImages.url) {
        updatedImages = [{
          url: parsedImages.url,
          public_id: parsedImages.public_id || parsedImages.url.split("/").pop().split(".")[0]
        }];
      }
    }

    // Add newly uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        url: file.path,
        public_id: file.filename
      }));
      updatedImages = [...updatedImages, ...newImages];
    }

    // Update the room
    const updatedRoom = await Room.findByIdAndUpdate(
      id,
      {
        title,
        description,
        location,
        price,
        preferences: preferences
          ? preferences.split(",").map(pref => pref.trim())
          : room.preferences,
        images: updatedImages.length > 0 ? updatedImages : room.images,
        coordinates: {
          type: "Point",
          coordinates: [
            parseFloat(lng) || room.coordinates.coordinates[0],
            parseFloat(lat) || room.coordinates.coordinates[1]
          ]
        }
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: "Room updated successfully",
      room: updatedRoom
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error updating room",
      error: err.message
    });
  }
};



// DELETE room (only by owner)
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const isOwner = room.owner.toString() === req.payload.id;
    const canDelete = req.payload.role === 'owner' || (req.payload.role === 'roommate' && req.payload.subRole === 'hasRoom');

    if (!isOwner || !canDelete) {
      return res.status(403).json({ message: "Not authorized to delete this room" });
    }

    await room.deleteOne();
    res.status(200).json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting room", error: err.message });
  }
};

// Match rooms by preferences
exports.matchRoomsByPreference = async (req, res) => {
  try {
    const currentUser = await User.findById(req.payload.id);

    // Find users who are roommates with a room to filter rooms
    const roommateUsers = await User.find({ role: 'roommate', subRole: 'hasRoom' }).select('_id');
    const roommateIds = roommateUsers.map(user => user._id);

    // Fetch only rooms from these roommates
    const allRooms = await Room.find({ owner: { $in: roommateIds } }).populate("owner");

    const keys = [
      "sleepSchedule",
      "foodHabit",
      "cleanlinessLevel",
      "noiseTolerance",
      "smoking",
      "petsAllowed",
    ];

    const matched = allRooms.map((room) => {
      let score = 0;
      keys.forEach((key) => {
        if (room.owner?.preferences?.[key] === currentUser.preferences?.[key]) score++;
      });

      return {
        room,
        matchPercent: Math.round((score / keys.length) * 100),
      };
    });

    matched.sort((a, b) => b.matchPercent - a.matchPercent);
    res.status(200).json(matched);
  } catch (err) {
    res.status(500).json({ message: "Error matching rooms", error: err.message });
  }
};