const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI;

// Check if MongoDB URI exists
if (!uri) {
  console.error('❌ ERROR: MONGODB_URI is not defined in .env file');
  console.error('Please create a .env file and add your MongoDB connection string');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("✅ Successfully connected to MongoDB!");
    
    const db = client.db('krishiLinkDB');
    const cropsCollection = db.collection('crops');
    const usersCollection = db.collection('users');

    // =====================
    // CROPS ROUTES
    // =====================
    
    // Get all crops (with optional search)
    app.get('/crops', async (req, res) => {
      try {
        const { search } = req.query;
        let query = {};
        
        if (search) {
          query = {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { type: { $regex: search, $options: 'i' } },
              { location: { $regex: search, $options: 'i' } }
            ]
          };
        }
        
        const crops = await cropsCollection.find(query).toArray();
        res.send(crops);
      } catch (error) {
        console.error('Error fetching crops:', error);
        res.status(500).send({ message: 'Failed to fetch crops', error: error.message });
      }
    });

    // Get latest 6 crops for homepage
    app.get('/crops/latest', async (req, res) => {
      try {
        const crops = await cropsCollection
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();
        res.send(crops);
      } catch (error) {
        console.error('Error fetching latest crops:', error);
        res.status(500).send({ message: 'Failed to fetch latest crops', error: error.message });
      }
    });

    // Get single crop by ID
    app.get('/crops/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
        
        if (!crop) {
          return res.status(404).send({ message: 'Crop not found' });
        }
        
        res.send(crop);
      } catch (error) {
        console.error('Error fetching crop:', error);
        res.status(500).send({ message: 'Failed to fetch crop', error: error.message });
      }
    });

    // Get crops by owner email (My Posts)
    app.get('/my-crops/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const crops = await cropsCollection
          .find({ 'owner.ownerEmail': email })
          .toArray();
        res.send(crops);
      } catch (error) {
        console.error('Error fetching user crops:', error);
        res.status(500).send({ message: 'Failed to fetch user crops', error: error.message });
      }
    });

    // Add new crop
    app.post('/crops', async (req, res) => {
      try {
        const crop = {
          ...req.body,
          interests: [],
          createdAt: new Date()
        };
        const result = await cropsCollection.insertOne(crop);
        res.send(result);
      } catch (error) {
        console.error('Error adding crop:', error);
        res.status(500).send({ message: 'Failed to add crop', error: error.message });
      }
    });

    // Update crop
    app.put('/crops/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedCrop = req.body;
        
        // Remove _id from update object to avoid error
        delete updatedCrop._id;
        
        const result = await cropsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedCrop }
        );
        res.send(result);
      } catch (error) {
        console.error('Error updating crop:', error);
        res.status(500).send({ message: 'Failed to update crop', error: error.message });
      }
    });

    // Delete crop
    app.delete('/crops/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await cropsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error('Error deleting crop:', error);
        res.status(500).send({ message: 'Failed to delete crop', error: error.message });
      }
    });

    // =====================
    // INTEREST ROUTES
    // =====================

    // Add interest to a crop
    app.post('/interests', async (req, res) => {
      try {
        const interest = req.body;
        const cropId = interest.cropId;
        
        // Check if user already sent interest for this crop
        const crop = await cropsCollection.findOne({ _id: new ObjectId(cropId) });
        const existingInterest = crop.interests?.find(
          int => int.userEmail === interest.userEmail
        );
        
        if (existingInterest) {
          return res.status(400).send({ message: 'You have already sent an interest for this crop' });
        }
        
        // Create unique ID for interest
        const interestId = new ObjectId();
        const newInterest = {
          _id: interestId,
          ...interest,
          createdAt: new Date()
        };

        // Add interest to crop's interests array
        const result = await cropsCollection.updateOne(
          { _id: new ObjectId(cropId) },
          { $push: { interests: newInterest } }
        );

        res.send(result);
      } catch (error) {
        console.error('Error adding interest:', error);
        res.status(500).send({ message: 'Failed to add interest', error: error.message });
      }
    });

    // Get user's interests
    app.get('/my-interests/:email', async (req, res) => {
      try {
        const email = req.params.email;
        
        const crops = await cropsCollection.find({
          'interests.userEmail': email
        }).toArray();

        // Extract only the interests of this user
        const userInterests = [];
        crops.forEach(crop => {
          const interest = crop.interests.find(int => int.userEmail === email);
          if (interest) {
            userInterests.push({
              ...interest,
              cropName: crop.name,
              cropOwner: crop.owner.ownerName,
              cropId: crop._id
            });
          }
        });

        res.send(userInterests);
      } catch (error) {
        console.error('Error fetching interests:', error);
        res.status(500).send({ message: 'Failed to fetch interests', error: error.message });
      }
    });

    // Update interest status (accept/reject) - CHALLENGE
    app.put('/interests/status', async (req, res) => {
      try {
        const { interestId, cropId, status } = req.body;

        // Get the crop first
        const crop = await cropsCollection.findOne({ _id: new ObjectId(cropId) });
        
        if (!crop) {
          return res.status(404).send({ message: 'Crop not found' });
        }

        // Find the interest
        const interest = crop.interests.find(
          int => int._id.toString() === interestId
        );

        if (!interest) {
          return res.status(404).send({ message: 'Interest not found' });
        }

        // Update the status
        const result = await cropsCollection.updateOne(
          { 
            _id: new ObjectId(cropId),
            'interests._id': new ObjectId(interestId)
          },
          { 
            $set: { 'interests.$.status': status }
          }
        );

        // If accepted, reduce crop quantity - CHALLENGE
        if (status === 'accepted') {
          await cropsCollection.updateOne(
            { _id: new ObjectId(cropId) },
            { $inc: { quantity: -interest.quantity } }
          );
        }

        res.send(result);
      } catch (error) {
        console.error('Error updating interest status:', error);
        res.status(500).send({ message: 'Failed to update interest status', error: error.message });
      }
    });

    // =====================
    // USER ROUTES
    // =====================

    // Save/update user
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        const result = await usersCollection.updateOne(
          { email: user.email },
          { $set: user },
          { upsert: true }
        );
        res.send(result);
      } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).send({ message: 'Failed to save user', error: error.message });
      }
    });

    // Get user by email
    app.get('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send(user);
      } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send({ message: 'Failed to fetch user', error: error.message });
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.send({ 
        status: 'Server is healthy', 
        timestamp: new Date(),
        database: 'Connected'
      });
    });

    console.log('📡 All API routes registered successfully');

  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

// Start the database connection
run().catch(console.dir);

// Root route
module.exports = app;

// Start the Express server
app.listen(port, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 KrishiLink Server Started!');
  console.log(`📍 Running on: http://localhost:${port}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await client.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});