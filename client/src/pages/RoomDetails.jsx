import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useAuth } from "../context/AuthContext";

// Fix for default Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const RoomDetails = () => {
  const { id } = useParams();
  const [room, setRoom] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const navigate = useNavigate();
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [hasRoom, setHasRoom] = useState(false);

  // Update isOwner and hasRoom when room or user changes
  useEffect(() => {
    console.log('User:', user);
    console.log('Room:', room);
    if (user && room) {
      console.log('User ID:', user.id);
      console.log('Room Owner ID:', room.owner?._id);
      const ownerMatch = user.id === room.owner?._id;
      console.log('Is Owner:', ownerMatch);
      setIsOwner(ownerMatch);
      setHasRoom(!!user.roomId);
    } else {
      console.log('User or room not available');
      setIsOwner(false);
      setHasRoom(false);
    }
  }, [user, room]);

  // Fetch room details
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/rooms/${id}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        
        // Debug log
        console.log('Room data from API:', {
          roomId: data._id,
          title: data.title,
          hasOwner: !!data.owner,
          owner: data.owner,
          contactInfo: data.owner?.contactInfo,
          phone: data.owner?.contactInfo?.phone,
          ownerId: data.owner?._id
        });
        
        setRoom(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoom();
  }, [id]);

  // Convert location to coordinates using OpenCage Geocoding
  useEffect(() => {
    const fetchCoordinates = async () => {
      if (!room || !room.location) return;

      try {
        const res = await fetch(
          `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
            room.location
          )}&key=${process.env.REACT_APP_OPENCAGE_API_KEY}`
        );
        const data = await res.json();
        const result = data.results[0];

        if (result) {
          setCoordinates({
            lat: result.geometry.lat,
            lng: result.geometry.lng,
          });
        } else {
          console.warn("No coordinates found for this location.");
        }
      } catch (err) {
        console.error("Failed to fetch coordinates:", err);
      }
    };
    fetchCoordinates();
  }, [room]);

  // Fetch user's current location using Geolocation API
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error getting user location:", error);
        }
      );
    } else {
      console.log("Geolocation is not supported by this browser.");
    }
  }, []);

  const handleMessageOwner = async () => {
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            receiverId: room.owner._id,
            content: `Hi, I'm interested in your room: "${room.title}".`,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      navigate(`/message/${room.owner._id}`);
    } catch (err) {
      alert("Failed to send message: " + err.message);
    }
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === room.images.length - 1 ? 0 : prev + 1
    );
  };

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? room.images.length - 1 : prev - 1
    );
  };

  // Function to calculate the route from user to room location using LocationIQ
  const calculateRoute = async () => {
    if (!userLocation || !coordinates) {
      alert("Your location or the room's location is not available.");
      return;
    }

    setIsCalculatingRoute(true);
    setDirectionsResponse(null); // Clear previous directions

    // LocationIQ Directions API URL
    const locationiqApiUrl = `https://us1.locationiq.com/v1/directions/driving/${userLocation.lng},${userLocation.lat};${coordinates.lng},${coordinates.lat}?key=${process.env.REACT_APP_LOCATIONIQ_API_KEY}&overview=full`;

    try {
      const res = await fetch(locationiqApiUrl);
      const data = await res.json();

      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const polyline = data.routes[0].geometry.coordinates.map((coord) => [
          coord[1],
          coord[0],
        ]);
        setDirectionsResponse(polyline);
      } else {
        console.error("LocationIQ API Error:", data.message);
        alert(`Could not find a route: ${data.message || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Failed to fetch directions:", err);
      alert("Failed to get directions. Please try again.");
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/rooms/${id}`,
          {
            method: "DELETE",
            credentials: "include",
          }
        );

        if (!res.ok) throw new Error('Failed to delete room');
        
        navigate('/my-rooms');
      } catch (err) {
        alert('Error deleting room: ' + err.message);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-96 bg-gray-200 rounded-lg"></div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-gray-200 rounded"></div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
                <div className="h-12 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-red-800">Error loading room details</h3>
                <div className="mt-2 text-red-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => navigate("/login")}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Go to Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500">No room details found.</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Property Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{room.title}</h1>
            <div className="mt-2 flex items-center text-gray-600">
              <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{room.location}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Image Gallery */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="relative h-96 w-full bg-gray-100">
                  {room.images && room.images.length > 0 ? (
                    <>
                      <img
                        src={room.images[currentImageIndex].url}
                        alt={`${room.title} - ${currentImageIndex + 1}`}
                        className="w-full h-full object-cover transition-opacity duration-300"
                      />
                      {room.images.length > 1 && (
                        <>
                          <button
                            onClick={handlePrevImage}
                            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110"
                          >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleNextImage}
                            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110"
                          >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
                            {currentImageIndex + 1} / {room.images.length}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <span>No images available</span>
                    </div>
                  )}
                </div>
                
                {/* Thumbnails */}
                {room.images && room.images.length > 1 && (
                  <div className="p-4 bg-gray-50">
                    <div className="flex space-x-2 overflow-x-auto pb-2">
                      {room.images.map((img, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`flex-shrink-0 w-20 h-16 rounded overflow-hidden ${currentImageIndex === index ? 'ring-2 ring-indigo-500' : 'opacity-70 hover:opacity-100'}`}
                        >
                          <img
                            src={img.url}
                            alt={`Thumbnail ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Property Details */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">About this property</h2>
                  <p className="text-gray-600 mb-6">{room.description || 'No description provided.'}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="flex items-center">
                      <div className="p-2 bg-indigo-50 rounded-lg mr-3">
                        <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Property Type</p>
                        <p className="font-medium">{room.preferences.join(", ")}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="p-2 bg-indigo-50 rounded-lg mr-3">
                        <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Available From</p>
                        <p className="font-medium">{new Date(room.availableFrom).toLocaleDateString()}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="p-2 bg-indigo-50 rounded-lg mr-3">
                        <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3l-3 3m6-3l-3-3m6-3l-3 3m-3 3h-6m-6 3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Posted</p>
                        <p className="font-medium">{new Date(room.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="p-2 bg-indigo-50 rounded-lg mr-3">
                        <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Owner</p>
                        <p className="font-medium">{room.owner?.name || 'Not specified'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Amenities</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {room.amenities && room.amenities.length > 0 ? (
                        room.amenities.map((amenity, index) => (
                          <div key={index} className="flex items-center">
                            <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-gray-700">{amenity}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500">No amenities listed</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Map Section */}
              {coordinates && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Location</h2>
                    <div className="h-96 rounded-lg overflow-hidden">
                      <MapContainer
                        center={[coordinates.lat, coordinates.lng]}
                        zoom={14}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={true}
                        className="rounded-lg"
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <Marker position={[coordinates.lat, coordinates.lng]}>
                          <Popup>
                            <div className="font-medium">{room.title}</div>
                            <div className="text-sm text-gray-600">{room.location}</div>
                          </Popup>
                        </Marker>
                        {userLocation && (
                          <Marker position={[userLocation.lat, userLocation.lng]}>
                            <Popup>
                              <div className="font-medium">Your Location</div>
                            </Popup>
                          </Marker>
                        )}
                        {directionsResponse && (
                          <Polyline
                            positions={directionsResponse}
                            color="#4F46E5"
                            weight={3}
                            opacity={0.7}
                          />
                        )}
                      </MapContainer>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <p className="text-sm text-gray-500">{room.location}</p>
                      <button
                        onClick={calculateRoute}
                        disabled={isCalculatingRoute}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {isCalculatingRoute ? 'Calculating...' : 'Get Directions'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Price Card */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-2xl font-bold text-gray-900">₹{room.price}</span>
                    <span className="text-gray-500 ml-1">/month</span>
                  </div>
                  {room.owner?.contactInfo?.phone && (
                    <a
                      href={`https://wa.me/91${room.owner.contactInfo.phone}?text=Hi, I'm interested in your room: ${encodeURIComponent(room.title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                    >
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.963-.94 1.16-.173.199-.347.223-.644.075-.297-.15-1.264-.465-2.4-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.298-.018-.46.13-.607.136-.129.296-.34.445-.51.146-.181.194-.298.296-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.508-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272" />
                      </svg>
                      Chat on WhatsApp
                    </a>
                  )}
                </div>

                <div className="space-y-4">
                  {isOwner ? (
                    <>
                      <button
                        onClick={() => navigate(`/rooms/${room._id}/edit`)}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Edit Property
                      </button>
                      <button
                        onClick={handleDeleteRoom}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Delete Property
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate(`/rooms/${room._id}/book`)}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Book Now
                      </button>
                      <button
                        onClick={handleMessageOwner}
                        className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Message Owner
                      </button>
                    </>
                  )}
                </div>

                {/* Contact Info */}
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">Contact Information</h3>
                  {room.owner ? (
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">{room.owner.name || 'Not specified'}</p>
                          <p className="text-sm text-gray-500">Property Owner</p>
                        </div>
                      </div>
                      
                      {room.owner.contactInfo?.phone && (
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{room.owner.contactInfo.phone}</p>
                            <p className="text-sm text-gray-500">Phone</p>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">{room.owner.email}</p>
                          <p className="text-sm text-gray-500">Email</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Owner information not available</p>
                  )}
                </div>
              </div>

              {/* Safety Tips */}
              <div className="bg-blue-50 rounded-xl p-6">
                <h3 className="text-sm font-medium text-blue-800 mb-2">Safety Tips</h3>
                <ul className="space-y-2 text-sm text-blue-700">
                  <li className="flex items-start">
                    <svg className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Never share personal or financial information</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>Don't transfer money without seeing the property</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Meet in a public place and bring someone with you</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default RoomDetails;