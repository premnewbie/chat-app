import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

// Existing function to get users for sidebar
export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Aggregate to get users and the latest message sent to the logged-in user
    const filteredUsers = await User.aggregate([
      {
        $match: { _id: { $ne: loggedInUserId } }, // Exclude the logged-in user
      },
      {
        $lookup: {
          from: "messages",
          let: { userId: "$_id" }, // Pass the user _id to the lookup
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$receiverId", loggedInUserId] }, // Match messages sent to the logged-in user
                    { $eq: ["$senderId", "$$userId"] } // Match messages sent by the user
                  ]
                }
              }
            },
            {
              $sort: { createdAt: -1 } // Sort by the most recent message first
            },
            {
              $limit: 1 // We only need the latest message
            }
          ],
          as: "latestMessage",
        },
      },
      {
        $unwind: {
          path: "$latestMessage",
          preserveNullAndEmptyArrays: true, // Keep users who have no messages
        },
      },
      {
        $sort: {
          "latestMessage.createdAt": -1, // Sort by latest message if available
          username: 1, // If no message, sort alphabetically by username
        },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          profilePic: 1,
          latestMessage: 1,
        },
      },
    ]);


    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Existing function to get messages between users
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Existing function to send a new message
export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    const receiverSocketid = getReceiverSocketId(receiverId);
    if(receiverSocketid){
      io.to(receiverSocketid).emit("newMessage",newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};