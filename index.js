const express = require("express");
require("dotenv").config();
var cors = require("cors");
var admin = require("firebase-admin");
const { MongoClient } = require("mongodb");
var ObjectId = require('mongodb').ObjectID;
const stripe = require("stripe")("sk_test_51KiCK6HlIpHzNhGaImExltHRso4TWkngHu4PTIoByELTQKii5jrQtutjdPqoYJcXRfeO1lJ7Q6B9Hsyl010rIBYO00aDYqRX9o")
const port = process.env.PORT || 5000;
const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb'}));

var serviceAccount = require("./we-hire-39c1f-firebase-adminsdk-iyygc-2bcdd2c8e4.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3nf9m.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
async function verifyToken(req,res,next){
   if(req.headers?.authorization?.startsWith('Bearer ')){
        const token=req.headers.authorization.split(' ')[1];
        try{
           const decodedUser=await admin.auth().verifyIdToken(token)
           req.decodedEmail=decodedUser.email
        }
        catch{
          
        }
   }
   next()
 }
async function run() {
  try {
    await client.connect();
    const database = client.db("we-hire");
    const categories = database.collection("categories");
    const addRent = database.collection("rent");
    const usersCollection = database.collection("users");

    app.post("/categories", async (req, res) => {
      const category = req.body;
      const result = await categories.insertOne(category);
      res.json(result); 
    });
    app.get("/categories", async (req, res) => {
      const cursor = categories.find({});
      const category = await cursor.toArray();
      res.json(category);
    });
    app.post("/addrent", async (req, res) => {
      const rent = req.body;
      const result = await addRent.insertOne(rent);
      res.json(result);
    });
    app.get("/addrent", async (req, res) => {
      const cursor = addRent.find({});
      const rent = await cursor.toArray();
      res.json(rent);
    });
    app.get('/mypost',verifyToken,async(req,res)=>{
      const email=req.query.email
      console.log(email);
      const query={email:email}
      const cursor =  addRent.find(query);
      const service=await cursor.toArray()
      res.json(service)
    })
    app.get("/search/:category", async (req, res) => {
      const category=req.params.category;
      const query={category:category}
      const cursor = addRent.find(query);
      const rent = await cursor.toArray();
      res.json(rent);
    });
    app.get("/find", async (req, res) => {
      const request=req.query;
      const {search,category,areas,min,max}=request;
      const query={category,areas}
      const cursor = addRent.find(query);
      const rent = await cursor.toArray();
      let result=rent.filter(item=>min<=item.price&&item.price<=max);
          
        if(search){
          result=result.filter(item=>item.name.toLowerCase().includes(search.toLowerCase()))
          res.json(result);
        }
         else{
          res.json(result);
         }
      
    });
    app.get("/details/:id", async (req, res) => {
      const id=req.params.id;
      const query = {_id:ObjectId(id)};
      const cursor = addRent.find(query);
      const details = await cursor.toArray();
      res.json(details);
    });
    app.delete("/details/:id", async (req, res) => {
      const id=req.params.id;
      const query = {_id:ObjectId(id)};
      const cursor =await addRent.deleteOne(query);
      res.json(cursor);
    });
    app.put("/details/:id", async (req, res) => {
      const params=req.params.id;
      const updatedPost=req.body;
      const find={ _id:ObjectId(params) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name:updatedPost.name,
          url:updatedPost.url,
          price:updatedPost.price,
          location:updatedPost.location,
          description:updatedPost.description,
          pubName:updatedPost.pubName,
          number:updatedPost.number,
          category:updatedPost.category,
          areas:updatedPost.areas,
          pubPic:updatedPost.pubPic,
          email:updatedPost.email
        },
      };
      const result = await addRent.updateOne(find, updateDoc, options);
      console.log("updating");
      res.json(result);
    });
   
    app.post("/users", async (req, res) => {
      const users = req.body;
      console.log(users);
      const result = await usersCollection.insertOne(users);
      res.json(result);
    });
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const option = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDoc, option);
      res.json(result);
    });

    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount?.role == "admin") {
          const filter = { email: user.email };
          const updateDoc = {
            $set: { role: "admin" },
          };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        } else {
          res.status(403).json({ message: "you do not have to access admin" });
        }
      }
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const cursor = await usersCollection.findOne(query);
      let isAdmin = false;
      if (cursor?.role == "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount=paymentInfo.price*100
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.put('/payment/:id',async(req,res)=>{
      const id=req.params.id 
      const payment=req.body
      const filter={_id:ObjectId(id)}
      const updateDoc = {
        $set:
        {
          payment:payment
        }
      };
      const result = await addRent.updateOne(filter, updateDoc);
      res.json(result)
    })
  } finally {
    //   await client.close();
  }
}
run().catch();

app.get("/", (req, res) => {
  res.send("We Hire Database Running");
});

app.listen(port, () => {
  console.log("Listinging to port", port);
});
